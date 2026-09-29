"""Training certificates: list/issue/self-issue/verify."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import display_names, global_role, is_enrolled, load_program, require_staff_or_ta
from app.api.v1.training.progress import load_curriculum, load_reviews, load_submissions
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingCertificate, TrainingEnrollment
from app.training.certificate import assess_completion, build_payload, hash_payload, verify_hash
from app.training.progress import derive_task_status

program_router = APIRouter(prefix="/programs/{program_id}/certificates", tags=["training"])
me_router = APIRouter(prefix="/me/certificate", tags=["training"])
verify_router = APIRouter(prefix="/certificates/verify", tags=["training"])


class CertificateIssue(CamelModel):
    learner_ids: list[uuid.UUID] | None = None


class SelfIssue(CamelModel):
    program_id: uuid.UUID


def serialize_certificate(cert: TrainingCertificate) -> dict[str, Any]:
    return {
        "id": cert.id,
        "programId": str(cert.program_id),
        "learnerId": str(cert.learner_id),
        "contentHash": cert.content_hash,
        "payload": cert.payload,
        "issuedAt": iso(cert.issued_at),
    }


async def _task_status(
    session: AsyncSession, program_id: uuid.UUID, learner_id: uuid.UUID, required_task_ids: list[str]
) -> dict[str, str]:
    submissions = [s for s in await load_submissions(session, program_id) if s.learner_id == learner_id]
    reviews = await load_reviews(session, submissions)
    latest_by_submission: dict[str, str] = {}
    # Sort by created_at so the newest review wins deterministically.
    for review in sorted(reviews, key=lambda r: r.created_at):
        latest_by_submission[str(review.submission_id)] = review.decision
    by_task = {s.task_id: s for s in submissions}
    statuses: dict[str, str] = {}
    for task_id in required_task_ids:
        submission = by_task.get(task_id)
        if submission is None:
            statuses[task_id] = "not_started"
            continue
        statuses[task_id] = derive_task_status(
            submission.status, latest_by_submission.get(str(submission.id))
        )
    return statuses


async def _issue(
    session: AsyncSession,
    program_id: uuid.UUID,
    program_name: str,
    learner_id: uuid.UUID,
    display_name: str | None,
    required_task_ids: list[str],
) -> TrainingCertificate:
    statuses = await _task_status(session, program_id, learner_id, required_task_ids)
    eligibility = assess_completion(required_task_ids, statuses)
    if not eligibility["eligible"]:
        raise HTTPException(status_code=400, detail=f"MISSING:{','.join(eligibility['missingRequired'])}")
    payload = build_payload(
        str(program_id),
        program_name,
        str(learner_id),
        display_name,
        eligibility["completedRequired"],
        required_task_ids,
    )
    content_hash = hash_payload(payload)
    existing = await session.scalar(
        select(TrainingCertificate).where(
            TrainingCertificate.program_id == program_id,
            TrainingCertificate.learner_id == learner_id,
        )
    )
    if existing is not None:
        existing.content_hash = content_hash
        existing.payload = payload
        existing.issued_at = datetime.now(UTC)
        await session.commit()
        return existing
    cert = TrainingCertificate(
        id=uuid.uuid4().hex,
        program_id=program_id,
        learner_id=learner_id,
        content_hash=content_hash,
        payload=payload,
    )
    session.add(cert)
    await session.commit()
    return cert


@program_router.get("")
async def list_certificates(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List issued certificates for the program (staff or program TA)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_staff_or_ta(session, role, user_id, program)
    rows = (
        await session.scalars(
            select(TrainingCertificate)
            .where(TrainingCertificate.program_id == program_id)
            .order_by(TrainingCertificate.issued_at.desc())
        )
    ).all()
    return ok([serialize_certificate(row) for row in rows])


@program_router.post("", status_code=status.HTTP_201_CREATED)
async def issue_certificates(
    program_id: uuid.UUID,
    body: CertificateIssue,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Batch-issue certificates for eligible active learners (staff or program TA)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_staff_or_ta(session, role, user_id, program)

    curriculum = await load_curriculum(session, program_id)
    required_task_ids = [cfg.task_id for cfg in curriculum if cfg.required]

    stmt = select(TrainingEnrollment).where(
        TrainingEnrollment.program_id == program_id, TrainingEnrollment.status != "removed"
    )
    if body.learner_ids:
        stmt = stmt.where(TrainingEnrollment.learner_id.in_(body.learner_ids))
    enrollments = (await session.scalars(stmt)).all()
    names = await display_names(session, [e.learner_id for e in enrollments])

    issued: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for enrollment in enrollments:
        try:
            cert = await _issue(
                session,
                program_id,
                program.name,
                enrollment.learner_id,
                names.get(str(enrollment.learner_id)),
                required_task_ids,
            )
        except HTTPException as exc:
            skipped.append({"learnerId": str(enrollment.learner_id), "reason": str(exc.detail)})
            continue
        issued.append({"learnerId": str(enrollment.learner_id), "contentHash": cert.content_hash, "id": cert.id})
    return ok({"issued": issued, "skipped": skipped})


@me_router.post("", status_code=status.HTTP_201_CREATED)
async def self_issue(
    body: SelfIssue,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Learner self-issues a certificate when eligible."""
    user_id = identity_uuid(identity)
    if not await is_enrolled(session, user_id, body.program_id):
        raise HTTPException(status_code=403, detail="NOT_ENROLLED")
    program = await load_program(session, body.program_id)

    existing = await session.scalar(
        select(TrainingCertificate).where(
            TrainingCertificate.program_id == body.program_id,
            TrainingCertificate.learner_id == user_id,
        )
    )
    if existing is not None:
        return {"ok": True, "data": serialize_certificate(existing), "alreadyIssued": True}

    curriculum = await load_curriculum(session, body.program_id)
    required_task_ids = [cfg.task_id for cfg in curriculum if cfg.required]
    names = await display_names(session, [user_id])
    cert = await _issue(session, body.program_id, program.name, user_id, names.get(str(user_id)), required_task_ids)
    return ok(serialize_certificate(cert))


@verify_router.get("")
async def verify_certificate(
    hash: str = Query(min_length=16), session: AsyncSession = Depends(get_session)
):
    """Public hash verification; returns redacted metadata only."""
    normalized = hash.lower()
    cert = await session.scalar(
        select(TrainingCertificate).where(TrainingCertificate.content_hash == normalized)
    )
    if cert is None:
        return {"ok": True, "valid": False}
    payload = cert.payload
    match = verify_hash(payload, cert.content_hash)
    return {
        "ok": True,
        "valid": match,
        "data": (
            {
                "programName": payload.get("programName"),
                "displayName": payload.get("displayName"),
                "completedAt": payload.get("completedAt"),
                "issuer": payload.get("issuer"),
                "taskCount": len(payload.get("completedTaskIds", [])),
                "issuedAt": iso(cert.issued_at),
                "contentHash": cert.content_hash,
            }
            if match
            else None
        ),
    }
