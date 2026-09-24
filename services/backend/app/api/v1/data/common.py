"""Shared helpers for the research-core data routers."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BibItem, Manuscript, ManuscriptBlock, Project, Task


class CamelModel(BaseModel):
    """Base request model accepting/emitting camelCase JSON keys."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def iso(value: datetime | None) -> str | None:
    """Serialize a datetime to ISO-8601, tolerating nulls."""
    return value.isoformat() if value else None


def ok(data: Any) -> dict[str, Any]:
    """Standard success envelope."""
    return {"ok": True, "data": data}


async def owned_manuscript(session: AsyncSession, manuscript_id: uuid.UUID, owner_id: uuid.UUID) -> Manuscript:
    """Load a manuscript whose project belongs to the caller, or raise 404."""
    manuscript = await session.scalar(
        select(Manuscript).join(Project, Project.id == Manuscript.project_id).where(
            Manuscript.id == manuscript_id, Project.owner_id == owner_id
        )
    )
    if not manuscript:
        raise HTTPException(status_code=404, detail="MANUSCRIPT_NOT_FOUND")
    return manuscript


async def owned_block(session: AsyncSession, block_id: uuid.UUID, owner_id: uuid.UUID) -> ManuscriptBlock:
    """Load a manuscript block whose project belongs to the caller, or raise 404."""
    block = await session.scalar(
        select(ManuscriptBlock)
        .join(Manuscript, Manuscript.id == ManuscriptBlock.manuscript_id)
        .join(Project, Project.id == Manuscript.project_id)
        .where(ManuscriptBlock.id == block_id, Project.owner_id == owner_id)
    )
    if not block:
        raise HTTPException(status_code=404, detail="BLOCK_NOT_FOUND")
    return block


async def owned_bib_item(session: AsyncSession, item_id: uuid.UUID, owner_id: uuid.UUID) -> BibItem:
    """Load a bibliography item whose project belongs to the caller, or raise 404."""
    item = await session.scalar(
        select(BibItem).join(Project, Project.id == BibItem.project_id).where(
            BibItem.id == item_id, Project.owner_id == owner_id
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="BIB_ITEM_NOT_FOUND")
    return item


async def owned_task(session: AsyncSession, task_id: uuid.UUID, owner_id: uuid.UUID) -> Task:
    """Load a task whose project belongs to the caller, or raise 404."""
    task = await session.scalar(
        select(Task).join(Project, Project.id == Task.project_id).where(
            Task.id == task_id, Project.owner_id == owner_id
        )
    )
    if not task:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")
    return task
