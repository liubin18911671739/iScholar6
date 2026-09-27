"""Anonymous peer review for training camps (``/v1/training/peer``)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.me import serialize_evidence
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import EvidenceCard, TrainingPeerAssignment, TrainingPeerReview, TrainingSubmission

router = APIRouter(prefix="/peer", tags=["training"])

_PEER_DECISIONS = {"approved", "needs_revision"}


class PeerReviewSubmit(CamelModel):
    assignment_id: uuid.UUID
    decision: str = Field(min_length=1, max_length=32)
    feedback: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    evidence_card_ids: list[str] = Field(default_factory=list)


def anonymize_learner_token(learner_id: uuid.UUID | str) -> str:
    """Stable anonymized author token (8 hex chars), mirroring the legacy helper."""
    return hashlib.sha256(str(learner_id).encode()).hexdigest()[:8]


def serialize_peer_review(review: TrainingPeerReview) -> dict[str, Any]:
    return {
        "id": str(review.id),
        "assignmentId": str(review.assignment_id),
        "decision": review.decision,
        "score": review.score,
        "feedback": review.feedback,
        "evidenceCardIds": review.evidence_card_ids,
        "createdAt": iso(review.created_at),
    }


@router.get("")
async def list_assignments(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """List the caller's pending peer assignments with an anonymized author."""
    user_id = identity_uuid(identity)
    assignments = (
        await session.scalars(
            select(TrainingPeerAssignment)
            .where(
                TrainingPeerAssignment.reviewer_learner_id == user_id,
                TrainingPeerAssignment.status == "pending",
            )
            .order_by(TrainingPeerAssignment.assigned_at)
        )
    ).all()

    items = []
    for assignment in assignments:
        submission = await session.get(TrainingSubmission, assignment.submission_id)
        if submission is None:
            continue
        evidence = (
            await session.scalars(
                select(EvidenceCard).where(EvidenceCard.submission_id == str(submission.id))
            )
        ).all()
        items.append(
            {
                "assignmentId": str(assignment.id),
                "submissionId": str(submission.id),
                "programId": str(assignment.program_id),
                "taskId": submission.task_id,
                "taskTitle": submission.task_id,
                "authorToken": anonymize_learner_token(submission.learner_id),
                "answers": submission.answers,
                "reflection": submission.reflection,
                "evidenceCards": [serialize_evidence(c) for c in evidence],
                "assignedAt": iso(assignment.assigned_at),
                "dueAt": iso(assignment.due_at),
                "status": assignment.status,
            }
        )
    return ok(items)


@router.post("", status_code=status.HTTP_201_CREATED)
async def complete_peer_review(
    body: PeerReviewSubmit,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Record a peer review atomically (port of the ``complete_peer_review`` RPC)."""
    user_id = identity_uuid(identity)
    assignment = await session.scalar(
        select(TrainingPeerAssignment)
        .where(TrainingPeerAssignment.id == body.assignment_id)
        .with_for_update()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="ASSIGNMENT_NOT_FOUND")
    if assignment.reviewer_learner_id != user_id:
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    if assignment.status != "pending":
        raise HTTPException(status_code=409, detail="ASSIGNMENT_NOT_PENDING")
    if body.decision not in _PEER_DECISIONS:
        raise HTTPException(status_code=422, detail="INVALID_DECISION")

    review = TrainingPeerReview(
        assignment_id=assignment.id,
        decision=body.decision,
        feedback=body.feedback,
        score=body.score,
        evidence_card_ids=body.evidence_card_ids,
    )
    session.add(review)
    assignment.status = "completed"
    assignment.completed_at = datetime.now(UTC)
    submission = await session.get(TrainingSubmission, assignment.submission_id)
    if submission is not None:
        submission.peer_status = "peer_done"
    await session.commit()
    return ok(serialize_peer_review(review))
