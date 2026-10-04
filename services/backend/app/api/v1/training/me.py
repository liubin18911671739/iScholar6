"""Learner training data: enrollments, submissions, and reviews (``/v1/training/me``)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import is_enrolled, load_program
from app.api.v1.training.programs import serialize_program
from app.core.db import get_session
from app.core.notify import notify_program
from app.core.security import Identity, require_identity
from app.models import AiConsent, EvidenceCard, TrainingEnrollment, TrainingProgram, TrainingReview, TrainingSubmission
from app.privacy.sensitive_content import contains_sensitive_content, join_text_fields

router = APIRouter(prefix="/me", tags=["training"])

CONSENT_MAX_AGE = timedelta(minutes=30)

# Learners may only draft or submit; completion is derived from a staff review.
LEARNER_STATUSES = {"draft", "in_progress", "submitted"}


class ConsentProof(CamelModel):
    consent_id: uuid.UUID
    consented_at: datetime


class SubmissionSubmit(CamelModel):
    program_id: uuid.UUID
    task_id: str = Field(min_length=1, max_length=200)
    answers: dict[str, Any] = Field(default_factory=dict)
    reflection: str | None = None
    status: str = Field(default="submitted", max_length=32)
    consent_proof: ConsentProof | None = None


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


def serialize_enrollment(enrollment: TrainingEnrollment) -> dict[str, Any]:
    return {
        "id": str(enrollment.id),
        "programId": str(enrollment.program_id),
        "learnerId": str(enrollment.learner_id),
        "status": enrollment.status,
        "role": enrollment.role,
        "lastNudgedAt": iso(enrollment.last_nudged_at),
        "joinedAt": iso(enrollment.joined_at),
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


def serialize_evidence(card: EvidenceCard) -> dict[str, Any]:
    return {
        "id": card.id,
        "submissionId": card.submission_id,
        "projectId": card.project_id,
        "claim": card.claim,
        "sourceExcerpt": card.source_excerpt,
        "sourceUrl": card.source_url,
        "verificationStatus": card.verification_status,
        "evidenceStrength": card.evidence_strength,
        "userNote": card.user_note,
        "createdAt": iso(card.created_at),
    }


@router.get("")
async def read_me(
    include: str = Query(default="enrollments"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Return the learner's enrollments, optionally with submissions and reviews."""
    user_id = identity_uuid(identity)
    enrollments = (
        await session.scalars(
            select(TrainingEnrollment)
            .where(TrainingEnrollment.learner_id == user_id, TrainingEnrollment.status != "removed")
            .order_by(TrainingEnrollment.joined_at)
        )
    ).all()

    program_ids = [e.program_id for e in enrollments]
    programs = (
        {p.id: p for p in await session.scalars(select(TrainingProgram).where(TrainingProgram.id.in_(program_ids)))}
        if program_ids
        else {}
    )
    data = [
        {**serialize_enrollment(e), "program": serialize_program(programs[e.program_id]) if e.program_id in programs else None}
        for e in enrollments
    ]

    if include not in {"submissions", "all"}:
        return {"ok": True, "data": data}

    submissions = (
        await session.scalars(
            select(TrainingSubmission)
            .where(TrainingSubmission.learner_id == user_id)
            .order_by(TrainingSubmission.updated_at.desc())
        )
    ).all()
    submission_ids = [s.id for s in submissions]
    reviews = (
        await session.scalars(
            select(TrainingReview).where(TrainingReview.submission_id.in_(submission_ids))
        )
    ).all() if submission_ids else []
    evidence = (
        await session.scalars(
            select(EvidenceCard).where(EvidenceCard.submission_id.in_([str(i) for i in submission_ids]))
        )
    ).all() if submission_ids else []

    reviews_by_submission: dict[str, list[TrainingReview]] = {}
    for review in reviews:
        reviews_by_submission.setdefault(str(review.submission_id), []).append(review)
    evidence_by_submission: dict[str, list[EvidenceCard]] = {}
    for card in evidence:
        evidence_by_submission.setdefault(card.submission_id, []).append(card)

    enriched = []
    for submission in submissions:
        key = str(submission.id)
        sub_reviews = sorted(reviews_by_submission.get(key, []), key=lambda r: r.created_at, reverse=True)
        enriched.append(
            {
                **serialize_submission(submission),
                "reviews": [serialize_review(r) for r in sub_reviews],
                "latestReview": serialize_review(sub_reviews[0]) if sub_reviews else None,
                "evidenceCards": [serialize_evidence(c) for c in evidence_by_submission.get(key, [])],
            }
        )
    return {"ok": True, "data": data, "submissions": enriched}


@router.post("", status_code=status.HTTP_201_CREATED)
async def submit(
    body: SubmissionSubmit,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Create or resubmit the learner's answer, gated on enrollment and camp consent."""
    user_id = identity_uuid(identity)
    if not await is_enrolled(session, user_id, body.program_id):
        raise HTTPException(status_code=403, detail="NOT_ENROLLED")
    if body.status not in LEARNER_STATUSES:
        raise HTTPException(status_code=422, detail="INVALID_STATUS")

    program = await load_program(session, body.program_id)
    if program.status == "archived":
        raise HTTPException(status_code=409, detail="PROGRAM_NOT_ACCEPTING")

    # Server-side PII gate (defense in depth; the client also blocks + masks).
    blob = join_text_fields({**body.answers, "reflection": body.reflection or ""})
    if contains_sensitive_content(blob):
        raise HTTPException(status_code=400, detail="SENSITIVE_CONTENT")

    if body.status == "submitted":
        proof = body.consent_proof
        if proof is None:
            raise HTTPException(status_code=403, detail="CONSENT_REQUIRED")
        consented_at = proof.consented_at
        if consented_at.tzinfo is None:
            consented_at = consented_at.replace(tzinfo=UTC)
        age = datetime.now(UTC) - consented_at
        if age < timedelta(0) or age > CONSENT_MAX_AGE:
            raise HTTPException(status_code=403, detail="CONSENT_EXPIRED")
        consent = await session.get(AiConsent, proof.consent_id)
        if (
            consent is None
            or consent.owner_id != user_id
            or consent.program_id != body.program_id
            or consent.purpose != "training_submit"
            or not consent.redaction_confirmed
        ):
            raise HTTPException(status_code=403, detail="CONSENT_INVALID")

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
            status=body.status,
            peer_status="none",
        )
        session.add(submission)
    else:
        submission.answers = body.answers
        submission.reflection = body.reflection
        submission.status = body.status
    await notify_program(
        session,
        body.program_id,
        "training.submission",
        {"id": str(submission.id), "taskId": submission.task_id, "status": submission.status},
    )
    await session.commit()
    return ok(serialize_submission(submission))
