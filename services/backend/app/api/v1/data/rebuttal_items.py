"""Rebuttal item CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok, owned_rebuttal_item, owned_review_round
from app.api.v1.deps import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import RebuttalItem

router = APIRouter(prefix="/rebuttal-items", tags=["data"])


class RebuttalItemCreate(CamelModel):
    review_round_id: uuid.UUID
    reviewer_comment: str = Field(min_length=1)
    response: str | None = None
    change_location: str | None = None
    evidence: dict[str, Any] | None = None


class RebuttalItemUpdate(CamelModel):
    reviewer_comment: str | None = Field(default=None, min_length=1)
    response: str | None = None
    change_location: str | None = None
    evidence: dict[str, Any] | None = None


def serialize_rebuttal_item(item: RebuttalItem) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "reviewRoundId": str(item.review_round_id),
        "reviewerComment": item.reviewer_comment,
        "response": item.response,
        "changeLocation": item.change_location,
        "evidence": item.evidence,
    }


@router.get("")
async def list_rebuttal_items(
    review_round_id: uuid.UUID = Query(alias="reviewRoundId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_review_round(session, review_round_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(RebuttalItem).where(RebuttalItem.review_round_id == review_round_id)
        )
    ).all()
    return ok([serialize_rebuttal_item(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rebuttal_item(
    body: RebuttalItemCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_review_round(session, body.review_round_id, identity_uuid(identity))
    item = RebuttalItem(
        review_round_id=body.review_round_id,
        reviewer_comment=body.reviewer_comment,
        response=body.response,
        change_location=body.change_location,
        evidence=body.evidence or {},
    )
    session.add(item)
    await session.commit()
    return ok(serialize_rebuttal_item(item))


@router.patch("/{item_id}")
async def update_rebuttal_item(
    item_id: uuid.UUID,
    body: RebuttalItemUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    item = await owned_rebuttal_item(session, item_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(item, key, value)
    await session.commit()
    return ok(serialize_rebuttal_item(item))


@router.delete("/{item_id}")
async def delete_rebuttal_item(
    item_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    item = await owned_rebuttal_item(session, item_id, identity_uuid(identity))
    await session.delete(item)
    await session.commit()
    return ok({"id": str(item_id)})
