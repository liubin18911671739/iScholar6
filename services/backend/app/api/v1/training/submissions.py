"""Learner submissions and staff/TA reviews for training camps."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import (
    can_manage_or_ta,
    can_review,
    global_role,
    is_enrolled,
    load_program,
    require_read,
)
from app.core.db import get_session
from app.core.notify import notify_program
from app.core.security import Identity, require_identity
from app.models import TrainingReview, TrainingSubmission
from app.models.domain import now

router = APIRouter(prefix="/submissions", tags=["training"])

_DECISION_STATUS = {"approved": "completed", "escalated": "escalated", "needs_revision": "needs_review"}

# Learners may only draft or submit; "completed"/"approved" are derived from a
# staff review (prevents self-approval and certificate bypass).
LEARNER_STATUSES = {"draft", "in_progress", "submitted"}
REVIEWER_STATUSES = {"submitted", "needs_review", "escalated", "completed", "reviewed"}


class SubmissionUpsert(CamelModel):
    program_id: uuid.UUID
    task_id: str = Field(min_length=1, max_length=200)
    answers: dict[str, Any] = Field(default_factory=dict)
    reflection: str | None = None
    status: str | None = Field(default=None, max_length=32)


class SubmissionUpdate(CamelModel):
    answers: dict[str, Any] | None = None
    reflection: str | None = None
    status: str | None = Field(default=None, max_length=32)
    claim: bool | None = None


class ReviewCreate(CamelModel):
    decision: str = Field(min_length=1, max_length=32)
    feedback: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)


def serialize_submission(submission: TrainingSubmission) -> dict[str, Any]:
    return {
        "id": str(submission.id),
        "programId": str(submission.program_id),
        "taskId": submission.task_id,
        "learnerId": str(submission.learner_id),
        "answers": submission.answers,
        "reflection": submission.reflection,
        "status": submission.status,
        "peerStatus": submission.peer_status,
        "claimedBy": str(submission.claimed_by) if submission.claimed_by else None,
        "claimedAt": iso(submission.claimed_at),
        "updatedAt": iso(submission.updated_at),
    }


def serialize_review(review: TrainingReview) -> dict[str, Any]:
    return {
        "id": str(review.id),
        "submissionId": str(review.submission_id),
        "reviewerId": str(review.reviewer_id),
        "decision": review.decision,
        "feedback": review.feedback,
        "score": review.score,
        "createdAt": iso(review.created_at),
    }


async def _load_submission(session: AsyncSession, submission_id: uuid.UUID) -> TrainingSubmission:
    submission = await session.get(TrainingSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="SUBMISSION_NOT_FOUND")
    return submission


@router.get("")
async def list_my_submissions(
    program_id: uuid.UUID | None = Query(default=None, alias="programId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List the caller's own submissions, optionally scoped to a program."""
    user_id = identity_uuid(identity)
    stmt = select(TrainingSubmission).where(TrainingSubmission.learner_id == user_id)
    if program_id is not None:
        stmt = stmt.where(TrainingSubmission.program_id == program_id)
    rows = (await session.scalars(stmt.order_by(TrainingSubmission.updated_at.desc()))).all()
    return ok([serialize_submission(row) for row in rows])


@router.get("/by-program")
async def list_program_submissions(
    program_id: uuid.UUID = Query(alias="programId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List a program's submissions: all for staff/TA, only the caller's own for learners."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_read(session, role, user_id, program)

    stmt = select(TrainingSubmission).where(TrainingSubmission.program_id == program_id)
    # Non-privileged (enrolled) members must not read peers' answers.
    if not await can_manage_or_ta(session, role, user_id, program):
        stmt = stmt.where(TrainingSubmission.learner_id == user_id)
    rows = (await session.scalars(stmt.order_by(TrainingSubmission.updated_at.desc()))).all()
    return ok([serialize_submission(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upsert_submission(
    body: SubmissionUpsert,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Create or resubmit the caller's answer for a camp task."""
    user_id = identity_uuid(identity)
    if not await is_enrolled(session, user_id, body.program_id):
        raise HTTPException(status_code=403, detail="NOT_ENROLLED")
    if body.status is not None and body.status not in LEARNER_STATUSES:
        raise HTTPException(status_code=422, detail="INVALID_STATUS")

    submission = await session.scalar(
        select(TrainingSubmission).where(
            TrainingSubmission.program_id == body.program_id,
            TrainingSubmission.task_id == body.task_id,
            TrainingSubmission.learner_id == user_id,
        )
    )
    if submission is None:
        submission = TrainingSubmission(
            program_id=body.program_id,
            task_id=body.task_id,
            learner_id=user_id,
            answers=body.answers,
            reflection=body.reflection,
            status=body.status or "submitted",
        )
        session.add(submission)
    else:
        submission.answers = body.answers
        submission.reflection = body.reflection
        submission.status = body.status or "submitted"
    await notify_program(
        session,
        body.program_id,
        "training.submission",
        {"id": str(submission.id), "taskId": submission.task_id, "status": submission.status},
    )
    await session.commit()
    return ok(serialize_submission(submission))


@router.patch("/{submission_id}")
async def update_submission(
    submission_id: uuid.UUID,
    body: SubmissionUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Learner resubmit, or staff/TA claim/unclaim and status changes."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    submission = await _load_submission(session, submission_id)
    reviewer = await can_review(session, role, user_id, submission.program_id)
    owner = submission.learner_id == user_id

    if not reviewer and not owner:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    if owner and not reviewer:
        if body.status is not None and body.status not in LEARNER_STATUSES:
            raise HTTPException(status_code=422, detail="INVALID_STATUS")
        if body.answers is not None:
            submission.answers = body.answers
        if body.reflection is not None:
            submission.reflection = body.reflection
        if body.status is not None:
            submission.status = body.status
    else:
        if body.status is not None and body.status not in REVIEWER_STATUSES:
            raise HTTPException(status_code=422, detail="INVALID_STATUS")
        if body.claim is True:
            submission.claimed_by = user_id
            submission.claimed_at = now()
        elif body.claim is False:
            submission.claimed_by = None
            submission.claimed_at = None
        if body.status is not None:
            submission.status = body.status
    await notify_program(
        session,
        submission.program_id,
        "training.submission",
        {"id": str(submission.id), "taskId": submission.task_id, "status": submission.status},
    )
    await session.commit()
    return ok(serialize_submission(submission))


@router.get("/{submission_id}/reviews")
async def list_reviews(
    submission_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List a submission's reviews (owner learner or staff/TA)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    submission = await _load_submission(session, submission_id)
    allowed = submission.learner_id == user_id or await can_review(session, role, user_id, submission.program_id)
    if not allowed:
        raise HTTPException(status_code=404, detail="SUBMISSION_NOT_FOUND")

    rows = (
        await session.scalars(
            select(TrainingReview)
            .where(TrainingReview.submission_id == submission_id)
            .order_by(TrainingReview.created_at.desc())
        )
    ).all()
    return ok([serialize_review(row) for row in rows])


@router.post("/{submission_id}/reviews", status_code=status.HTTP_201_CREATED)
async def review_submission(
    submission_id: uuid.UUID,
    body: ReviewCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Record a staff/TA review (port of the ``review_training_submission`` RPC)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    submission = await _load_submission(session, submission_id)

    if not await can_review(session, role, user_id, submission.program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    if body.decision not in _DECISION_STATUS:
        raise HTTPException(status_code=422, detail="INVALID_REVIEW")
    if submission.status != "submitted":
        raise HTTPException(status_code=409, detail="SUBMISSION_NOT_PENDING")

    submission.status = _DECISION_STATUS[body.decision]
    submission.claimed_by = None
    submission.claimed_at = None

    review = TrainingReview(
        submission_id=submission.id,
        reviewer_id=user_id,
        decision=body.decision,
        feedback=body.feedback,
        score=body.score,
    )
    session.add(review)
    await notify_program(
        session,
        submission.program_id,
        "training.review",
        {"id": str(review.id), "submissionId": str(submission.id), "decision": review.decision},
    )
    await session.commit()
    return ok(serialize_review(review))
