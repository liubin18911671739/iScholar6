"""Attachment metadata + blob storage endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_attachment, owned_bib_item
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Attachment
from app.storage.blobs import delete_blob, resolve_blob, save_blob

router = APIRouter(prefix="/attachments", tags=["data"])


class AttachmentUpdate(CamelModel):
    filename: str | None = Field(default=None, min_length=1, max_length=400)
    bib_item_id: uuid.UUID | None = None


def serialize_attachment(attachment: Attachment) -> dict[str, Any]:
    return {
        "id": str(attachment.id),
        "projectId": str(attachment.project_id),
        "bibItemId": str(attachment.bib_item_id) if attachment.bib_item_id else None,
        "filename": attachment.filename,
        "contentHash": attachment.content_hash,
        "mimeType": attachment.mime_type,
        "sizeBytes": attachment.size_bytes,
        "encrypted": attachment.encrypted,
        "createdAt": iso(attachment.created_at),
    }


@router.get("")
async def list_attachments(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, project_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(Attachment)
            .where(Attachment.project_id == project_id)
            .order_by(Attachment.created_at.desc())
        )
    ).all()
    return ok([serialize_attachment(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_attachment(
    project_id: uuid.UUID = Form(alias="projectId"),
    file: UploadFile = File(...),
    bib_item_id: uuid.UUID | None = Form(default=None, alias="bibItemId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    await owned_project(session, project_id, owner_id)
    if bib_item_id is not None:
        await owned_bib_item(session, bib_item_id, owner_id)
    content = await file.read()
    relative_path, digest, size = save_blob(content)
    attachment = Attachment(
        project_id=project_id,
        bib_item_id=bib_item_id,
        filename=file.filename or "upload",
        storage_path=relative_path,
        content_hash=digest,
        mime_type=file.content_type,
        size_bytes=size,
        encrypted=False,
    )
    session.add(attachment)
    await session.commit()
    return ok(serialize_attachment(attachment))


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    attachment = await owned_attachment(session, attachment_id, identity_uuid(identity))
    path = resolve_blob(attachment.storage_path)
    return FileResponse(path, filename=attachment.filename, media_type=attachment.mime_type or "application/octet-stream")


@router.patch("/{attachment_id}")
async def update_attachment(
    attachment_id: uuid.UUID,
    body: AttachmentUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    attachment = await owned_attachment(session, attachment_id, identity_uuid(identity))
    fields = body.model_dump(exclude_unset=True)
    if fields.get("bib_item_id") is not None:
        await owned_bib_item(session, fields["bib_item_id"], identity_uuid(identity))
    for key, value in fields.items():
        if value is not None:
            setattr(attachment, key, value)
    await session.commit()
    return ok(serialize_attachment(attachment))


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    attachment = await owned_attachment(session, attachment_id, identity_uuid(identity))
    storage_path = attachment.storage_path
    await session.delete(attachment)
    await session.commit()
    delete_blob(storage_path)
    return ok({"id": str(attachment_id)})
