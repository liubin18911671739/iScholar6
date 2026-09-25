"""Review round CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok, owned_review_round, owned_submission
from app.api.v1.deps import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import ReviewRound

router = APIRouter(prefix="/review-rounds", tags=["data"])


class ReviewRoundCreate(CamelModel):
    submission_id: uuid.UUID
    round_number: int = 1
    decision: str | None = Field(default=None, max_length=64)
    review_text: str | None = None
    deadline: str | None = Field(default=None, max_length=64)


class ReviewRoundUpdate(CamelModel):
    round_number: int | None = None
    decision: str | None = Field(default=None, max_length=64)
    review_text: str | None = None
    deadline: str | None = Field(default=None, max_length=64)


def serialize_review_round(review_round: ReviewRound) -> dict[str, Any]:
    return {
        "id": str(review_round.id),
        "submissionId": str(review_round.submission_id),
        "roundNumber": review_round.round_number,
        "decision": review_round.decision,
        "reviewText": review_round.review_text,
        "deadline": review_round.deadline,
    }


@router.get("")
async def list_review_rounds(
    submission_id: uuid.UUID = Query(alias="submissionId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_submission(session, submission_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(ReviewRound)
            .where(ReviewRound.submission_id == submission_id)
            .order_by(ReviewRound.round_number)
        )
    ).all()
    return ok([serialize_review_round(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_review_round(
    body: ReviewRoundCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_submission(session, body.submission_id, identity_uuid(identity))
    review_round = ReviewRound(
        submission_id=body.submission_id,
        round_number=body.round_number,
        decision=body.decision,
        review_text=body.review_text,
        deadline=body.deadline,
    )
    session.add(review_round)
    await session.commit()
    return ok(serialize_review_round(review_round))


@router.patch("/{round_id}")
async def update_review_round(
    round_id: uuid.UUID,
    body: ReviewRoundUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    review_round = await owned_review_round(session, round_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(review_round, key, value)
    await session.commit()
    return ok(serialize_review_round(review_round))


@router.delete("/{round_id}")
async def delete_review_round(
    round_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    review_round = await owned_review_round(session, round_id, identity_uuid(identity))
    await session.delete(review_round)
    await session.commit()
    return ok({"id": str(round_id)})
