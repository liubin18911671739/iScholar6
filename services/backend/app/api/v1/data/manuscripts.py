"""Manuscript CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_manuscript
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Manuscript

router = APIRouter(prefix="/manuscripts", tags=["data"])


class ManuscriptCreate(CamelModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=500)
    abstract: str | None = None
    target_journal: str | None = Field(default=None, max_length=300)
    status: str | None = Field(default=None, max_length=32)


class ManuscriptUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    abstract: str | None = None
    current_version: int | None = None
    target_journal: str | None = Field(default=None, max_length=300)
    status: str | None = Field(default=None, max_length=32)


def serialize_manuscript(manuscript: Manuscript) -> dict[str, Any]:
    return {
        "id": str(manuscript.id),
        "projectId": str(manuscript.project_id),
        "title": manuscript.title,
        "abstract": manuscript.abstract,
        "currentVersion": manuscript.current_version,
        "targetJournal": manuscript.target_journal,
        "status": manuscript.status,
        "updatedAt": iso(manuscript.updated_at),
    }


@router.get("")
async def list_manuscripts(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    await owned_project(session, project_id, owner_id)
    rows = (
        await session.scalars(
            select(Manuscript).where(Manuscript.project_id == project_id).order_by(Manuscript.updated_at.desc())
        )
    ).all()
    return ok([serialize_manuscript(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_manuscript(
    body: ManuscriptCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    await owned_project(session, body.project_id, owner_id)
    manuscript = Manuscript(
        project_id=body.project_id,
        title=body.title,
        abstract=body.abstract,
        target_journal=body.target_journal,
        status=body.status,
    )
    session.add(manuscript)
    await session.commit()
    return ok(serialize_manuscript(manuscript))


@router.get("/{manuscript_id}")
async def get_manuscript(
    manuscript_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    manuscript = await owned_manuscript(session, manuscript_id, identity_uuid(identity))
    return ok(serialize_manuscript(manuscript))


@router.patch("/{manuscript_id}")
async def update_manuscript(
    manuscript_id: uuid.UUID,
    body: ManuscriptUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    manuscript = await owned_manuscript(session, manuscript_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(manuscript, key, value)
    await session.commit()
    return ok(serialize_manuscript(manuscript))


@router.delete("/{manuscript_id}")
async def delete_manuscript(
    manuscript_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    manuscript = await owned_manuscript(session, manuscript_id, identity_uuid(identity))
    await session.delete(manuscript)
    await session.commit()
    return ok({"id": str(manuscript_id)})
