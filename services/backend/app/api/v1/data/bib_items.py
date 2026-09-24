"""Bibliography item CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_bib_item
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import BibItem

router = APIRouter(prefix="/bib-items", tags=["data"])


class BibItemCreate(CamelModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1)
    doi: str | None = Field(default=None, max_length=300)
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    venue: str | None = Field(default=None, max_length=400)
    abstract: str | None = None
    keywords: list[str] = Field(default_factory=list)
    citation_count: int | None = None
    metadata: dict[str, Any] | None = None


class BibItemUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1)
    doi: str | None = Field(default=None, max_length=300)
    authors: list[str] | None = None
    year: int | None = None
    venue: str | None = Field(default=None, max_length=400)
    abstract: str | None = None
    keywords: list[str] | None = None
    citation_count: int | None = None
    metadata: dict[str, Any] | None = None


class BibItemBulkCreate(CamelModel):
    items: list[BibItemCreate] = Field(min_length=1, max_length=500)


def serialize_bib_item(item: BibItem) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "projectId": str(item.project_id),
        "title": item.title,
        "doi": item.doi,
        "authors": item.authors,
        "year": item.year,
        "venue": item.venue,
        "abstract": item.abstract,
        "keywords": item.keywords,
        "citationCount": item.citation_count,
        "metadata": item.metadata_,
        "createdAt": iso(item.created_at),
    }


def _apply(item: BibItem, body: BibItemCreate | BibItemUpdate) -> None:
    fields = body.model_dump(exclude_unset=True)
    if "metadata" in fields and fields["metadata"] is not None:
        item.metadata_ = fields.pop("metadata")
    for key, value in fields.items():
        if value is not None:
            setattr(item, key, value)


@router.get("")
async def list_bib_items(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, project_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(BibItem).where(BibItem.project_id == project_id).order_by(BibItem.created_at.desc())
        )
    ).all()
    return ok([serialize_bib_item(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_bib_item(
    body: BibItemCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, body.project_id, identity_uuid(identity))
    item = BibItem(project_id=body.project_id, title=body.title)
    _apply(item, body)
    session.add(item)
    await session.commit()
    return ok(serialize_bib_item(item))


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_bib_items(
    body: BibItemBulkCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    created: list[BibItem] = []
    for entry in body.items:
        await owned_project(session, entry.project_id, owner_id)
        item = BibItem(project_id=entry.project_id, title=entry.title)
        _apply(item, entry)
        session.add(item)
        created.append(item)
    await session.commit()
    return ok([serialize_bib_item(item) for item in created])


@router.patch("/{item_id}")
async def update_bib_item(
    item_id: uuid.UUID,
    body: BibItemUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    item = await owned_bib_item(session, item_id, identity_uuid(identity))
    _apply(item, body)
    await session.commit()
    return ok(serialize_bib_item(item))


@router.delete("/{item_id}")
async def delete_bib_item(
    item_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    item = await owned_bib_item(session, item_id, identity_uuid(identity))
    await session.delete(item)
    await session.commit()
    return ok({"id": str(item_id)})
