"""Reviewer queue and decisions (``/v1/training/reviews``)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, ok
from app.api.v1.training.deps import can_review, display_names, global_role, readable_program_ids
from app.api.v1.training.me import serialize_evidence, serialize_review, serialize_submission
from app.core.authz import is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import EvidenceCard, TrainingReview, TrainingSubmission

router = APIRouter(prefix="/reviews", tags=["training"])

_DECISION_STATUS = {"approved": "completed", "escalated": "escalated", "needs_revision": "needs_review"}


class ReviewAction(CamelModel):
    submission_id: uuid.UUID
    claim: bool | None = None
    decision: str | None = Field(default=None, max_length=32)
    feedback: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)


def _wait_ms(updated_at: datetime | None) -> int:
    if updated_at is None:
        return 0
    reference = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=UTC)
    return max(0, int((datetime.now(UTC) - reference).total_seconds() * 1000))


@router.get("")
async def list_queue(
    task_id: str | None = Query(default=None, alias="taskId"),
    learner_id: uuid.UUID | None = Query(default=None, alias="learnerId"),
    program_id: uuid.UUID | None = Query(default=None, alias="programId"),
    review_status: str = Query(default="submitted", alias="status"),
    decision: str | None = None,
    escalated_only: bool = Query(default=False, alias="escalatedOnly"),
    peer_status: str | None = Query(default=None, alias="peerStatus"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50, alias="pageSize"),
    sort: str = Query(default="newest"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List reviewable submissions for staff (all) or a camp TA (their camps)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    staff = is_global_staff(role)
    # Non-admins are limited to programs they own, manage in their org, or TA.
    allowed = await readable_program_ids(session, role, user_id)
    if allowed != "all" and not allowed:
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    conditions = []
    if program_id is not None:
        if allowed != "all" and program_id not in allowed:
            raise HTTPException(status_code=403, detail="FORBIDDEN")
        conditions.append(TrainingSubmission.program_id == program_id)
    elif allowed != "all":
        conditions.append(TrainingSubmission.program_id.in_(allowed))

    if escalated_only:
        # Escalated-only overrides the default "submitted" status filter.
        conditions.append(TrainingSubmission.status == "escalated")
    elif review_status == "pending":
        conditions.append(TrainingSubmission.status == "submitted")
    elif review_status != "all":
        conditions.append(TrainingSubmission.status == review_status)
    if task_id:
        conditions.append(TrainingSubmission.task_id == task_id)
    if learner_id is not None:
        conditions.append(TrainingSubmission.learner_id == learner_id)
    if peer_status:
        conditions.append(TrainingSubmission.peer_status == peer_status)

    total = await session.scalar(select(func.count()).select_from(TrainingSubmission).where(*conditions))
    ordering = TrainingSubmission.updated_at.asc() if sort == "oldest" else TrainingSubmission.updated_at.desc()
    rows = (
        await session.scalars(
            select(TrainingSubmission)
            .where(*conditions)
            .order_by(ordering)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    submission_ids = [row.id for row in rows]
    learner_ids = list({row.learner_id for row in rows})
    reviews = (
        await session.scalars(select(TrainingReview).where(TrainingReview.submission_id.in_(submission_ids)))
    ).all() if submission_ids else []
    evidence = (
        await session.scalars(
            select(EvidenceCard).where(EvidenceCard.submission_id.in_([str(i) for i in submission_ids]))
        )
    ).all() if submission_ids else []
    names = await display_names(session, learner_ids)

    reviews_by_submission: dict[str, list[TrainingReview]] = {}
    for review in reviews:
        reviews_by_submission.setdefault(str(review.submission_id), []).append(review)
    evidence_by_submission: dict[str, list[EvidenceCard]] = {}
    for card in evidence:
        evidence_by_submission.setdefault(card.submission_id, []).append(card)

    data = []
    for row in rows:
        key = str(row.id)
        sub_reviews = sorted(reviews_by_submission.get(key, []), key=lambda r: r.created_at, reverse=True)
        if decision and (sub_reviews[0].decision if sub_reviews else None) != decision:
            continue
        data.append(
            {
                **serialize_submission(row),
                "taskTitle": row.task_id,
                "learnerDisplayName": names.get(str(row.learner_id)),
                "waitMs": _wait_ms(row.updated_at),
                "evidenceCards": [serialize_evidence(c) for c in evidence_by_submission.get(key, [])],
                "reviews": [serialize_review(r) for r in sub_reviews],
                "latestReview": serialize_review(sub_reviews[0]) if sub_reviews else None,
            }
        )

    return {
        "ok": True,
        "data": data,
        "page": page,
        "pageSize": page_size,
        # The `decision` filter is applied after pagination, so the DB count no
        # longer matches; report the filtered size in that case.
        "total": len(data) if decision else (total or len(data)),
        "access": "staff" if staff else "ta",
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def review_action(
    body: ReviewAction,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Claim/unclaim a submission, or record a review decision."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    submission = await session.get(TrainingSubmission, body.submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="SUBMISSION_NOT_FOUND")
    if not await can_review(session, role, user_id, submission.program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    if body.claim is not None:
        if submission.status != "submitted":
            raise HTTPException(status_code=409, detail="SUBMISSION_NOT_PENDING")
        if body.claim:
            submission.claimed_by = user_id
            submission.claimed_at = datetime.now(UTC)
        else:
            submission.claimed_by = None
            submission.claimed_at = None
        await session.commit()
        return ok(serialize_submission(submission))

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
    await session.commit()
    return ok(serialize_review(review))
