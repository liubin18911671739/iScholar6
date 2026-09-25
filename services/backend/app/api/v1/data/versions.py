"""Manuscript version listing/creation (snapshots are normally written by blocks)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_block, owned_manuscript
from app.api.v1.deps import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import ManuscriptVersion

router = APIRouter(prefix="/manuscript-versions", tags=["data"])


class VersionCreate(CamelModel):
    manuscript_id: uuid.UUID
    block_id: uuid.UUID | None = None
    version: int
    content: str
    author_type: str | None = Field(default=None, max_length=32)
    agent_run_id: uuid.UUID | None = None
    content_hash: str = Field(min_length=1, max_length=128)


def serialize_version(version: ManuscriptVersion) -> dict[str, Any]:
    return {
        "id": str(version.id),
        "manuscriptId": str(version.manuscript_id),
        "blockId": str(version.block_id) if version.block_id else None,
        "version": version.version,
        "content": version.content,
        "authorType": version.author_type,
        "agentRunId": str(version.agent_run_id) if version.agent_run_id else None,
        "contentHash": version.content_hash,
        "createdAt": iso(version.created_at),
    }


@router.get("")
async def list_versions(
    manuscript_id: uuid.UUID | None = Query(default=None, alias="manuscriptId"),
    block_id: uuid.UUID | None = Query(default=None, alias="blockId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    if manuscript_id is None and block_id is None:
        return ok([])
    if manuscript_id is not None:
        await owned_manuscript(session, manuscript_id, identity_uuid(identity))
        condition = [ManuscriptVersion.manuscript_id == manuscript_id]
    else:
        assert block_id is not None
        await owned_block(session, block_id, identity_uuid(identity))
        condition = [ManuscriptVersion.block_id == block_id]
    rows = (
        await session.scalars(
            select(ManuscriptVersion).where(*condition).order_by(ManuscriptVersion.version.desc())
        )
    ).all()
    return ok([serialize_version(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_version(
    body: VersionCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_manuscript(session, body.manuscript_id, identity_uuid(identity))
    version = ManuscriptVersion(
        manuscript_id=body.manuscript_id,
        block_id=body.block_id,
        version=body.version,
        content=body.content,
        author_type=body.author_type,
        agent_run_id=body.agent_run_id,
        content_hash=body.content_hash,
    )
    session.add(version)
    await session.commit()
    return ok(serialize_version(version))
