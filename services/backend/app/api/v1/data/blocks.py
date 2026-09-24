"""Manuscript block CRUD and reordering."""

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
from app.models import ManuscriptBlock

router = APIRouter(prefix="/manuscript-blocks", tags=["data"])


class BlockCreate(CamelModel):
    manuscript_id: uuid.UUID
    section: str = Field(min_length=1, max_length=120)
    order: int = 0
    content: str = ""
    version: int | None = None
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
        version=body.version,
        author_type=body.author_type,
        agent_run_id=body.agent_run_id,
    )
    session.add(block)
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
