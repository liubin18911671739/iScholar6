"""Manuscript block CRUD, content snapshots, reordering, and rollback.

The backend owns versioning: creating a block writes its version-1 snapshot, and
a content-changing patch writes a new hashed snapshot — the client no longer
computes hashes or writes versions directly.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_block, owned_manuscript, owned_version
from app.api.v1.deps import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import ManuscriptBlock, ManuscriptVersion

router = APIRouter(prefix="/manuscript-blocks", tags=["data"])


class BlockCreate(CamelModel):
    manuscript_id: uuid.UUID
    section: str = Field(min_length=1, max_length=120)
    order: int = 0
    content: str = ""
    author_type: str | None = Field(default=None, max_length=32)
    agent_run_id: uuid.UUID | None = None


class BlockUpdate(CamelModel):
    section: str | None = Field(default=None, min_length=1, max_length=120)
    order: int | None = None
    content: str | None = None
    version: int | None = None
    author_type: str | None = Field(default=None, max_length=32)


class ReorderBody(CamelModel):
    manuscript_id: uuid.UUID
    ordered_ids: list[uuid.UUID] = Field(min_length=1)


class RollbackBody(CamelModel):
    version_id: uuid.UUID


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def serialize_block(block: ManuscriptBlock) -> dict[str, Any]:
    return {
        "id": str(block.id),
        "manuscriptId": str(block.manuscript_id),
        "section": block.section,
        "order": block.ordinal,
        "content": block.content,
        "version": block.version,
        "authorType": block.author_type,
        "agentRunId": str(block.agent_run_id) if block.agent_run_id else None,
        "updatedAt": iso(block.updated_at),
    }


@router.get("")
async def list_blocks(
    manuscript_id: uuid.UUID = Query(alias="manuscriptId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_manuscript(session, manuscript_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(ManuscriptBlock)
            .where(ManuscriptBlock.manuscript_id == manuscript_id)
            .order_by(ManuscriptBlock.ordinal)
        )
    ).all()
    return ok([serialize_block(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_block(
    body: BlockCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_manuscript(session, body.manuscript_id, identity_uuid(identity))
    block = ManuscriptBlock(
        manuscript_id=body.manuscript_id,
        section=body.section,
        ordinal=body.order,
        content=body.content,
        version=1,
        author_type=body.author_type or "human",
        agent_run_id=body.agent_run_id,
    )
    session.add(block)
    await session.flush()
    session.add(
        ManuscriptVersion(
            manuscript_id=body.manuscript_id,
            block_id=block.id,
            version=1,
            content=body.content,
            author_type=block.author_type,
            agent_run_id=body.agent_run_id,
            content_hash=content_hash(body.content),
        )
    )
    await session.commit()
    return ok(serialize_block(block))


@router.post("/reorder")
async def reorder_blocks(
    body: ReorderBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_manuscript(session, body.manuscript_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(ManuscriptBlock).where(
                ManuscriptBlock.manuscript_id == body.manuscript_id,
                ManuscriptBlock.id.in_(body.ordered_ids),
            )
        )
    ).all()
    by_id = {str(row.id): row for row in rows}
    for index, block_id in enumerate(body.ordered_ids):
        block = by_id.get(str(block_id))
        if block:
            block.ordinal = index
    await session.commit()
    return ok({"count": len(rows)})


@router.post("/{block_id}/rollback")
async def rollback_block(
    block_id: uuid.UUID,
    body: RollbackBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    block = await owned_block(session, block_id, owner_id)
    version = await owned_version(session, body.version_id, owner_id)
    if version.manuscript_id != block.manuscript_id:
        raise HTTPException(status_code=400, detail="VERSION_MANUSCRIPT_MISMATCH")
    block.content = version.content
    block.version = version.version
    block.author_type = "human"
    await session.commit()
    return ok(serialize_block(block))


@router.patch("/{block_id}")
async def update_block(
    block_id: uuid.UUID,
    body: BlockUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    block = await owned_block(session, block_id, identity_uuid(identity))
    fields = body.model_dump(exclude_unset=True)

    order = fields.pop("order", None)
    if order is not None:
        block.ordinal = order

    new_content = fields.pop("content", None)
    if new_content is not None and new_content != block.content:
        next_version = (block.version or 1) + 1
        session.add(
            ManuscriptVersion(
                manuscript_id=block.manuscript_id,
                block_id=block.id,
                version=next_version,
                content=new_content,
                author_type=fields.get("author_type") or "human",
                content_hash=content_hash(new_content),
            )
        )
        block.content = new_content
        block.version = next_version

    for key, value in fields.items():
        if value is not None:
            setattr(block, key, value)
    await session.commit()
    return ok(serialize_block(block))


@router.delete("/{block_id}")
async def delete_block(
    block_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    block = await owned_block(session, block_id, identity_uuid(identity))
    await session.delete(block)
    await session.commit()
    return ok({"id": str(block_id)})
