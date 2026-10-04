"""Learner evidence cards (``/v1/training/submissions/{id}/evidence``)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, ok
from app.api.v1.training.deps import can_review, global_role
from app.api.v1.training.me import serialize_evidence
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import EvidenceCard, TrainingSubmission
from app.privacy.sensitive_content import contains_sensitive_content

router = APIRouter(tags=["training"])


class EvidenceCreate(CamelModel):
    claim: str = Field(min_length=1)
    source_excerpt: str | None = None
    source_url: str | None = None
    bib_item_id: str | None = None
    verification_status: str = Field(default="unverified", max_length=32)


class EvidenceUpdate(CamelModel):
    claim: str | None = None
    source_excerpt: str | None = None
    source_url: str | None = None
    verification_status: str | None = Field(default=None, max_length=32)
    evidence_strength: str | None = Field(default=None, max_length=32)
    user_note: str | None = None


async def _owned_submission(
    session: AsyncSession, submission_id: uuid.UUID, user_id: uuid.UUID, role: str | None
) -> TrainingSubmission:
    """Load a submission the caller owns or may review, else 404."""
    submission = await session.get(TrainingSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="SUBMISSION_NOT_FOUND")
    if submission.learner_id != user_id and not await can_review(session, role, user_id, submission.program_id):
        raise HTTPException(status_code=404, detail="SUBMISSION_NOT_FOUND")
    return submission


@router.post("/submissions/{submission_id}/evidence", status_code=status.HTTP_201_CREATED)
async def create_evidence(
    submission_id: uuid.UUID,
    body: EvidenceCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Attach an evidence card to a submission the caller owns or reviews."""
    blob = "\n".join(value for value in (body.claim, body.source_excerpt) if value)
    if contains_sensitive_content(blob):
        raise HTTPException(status_code=400, detail="SENSITIVE_CONTENT")
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    submission = await _owned_submission(session, submission_id, user_id, role)
    card = EvidenceCard(
        id=str(uuid.uuid4()),
        submission_id=str(submission.id),
        project_id=str(submission.project_id),
        claim=body.claim,
        source_excerpt=body.source_excerpt,
        source_url=body.source_url,
        bib_item_id=body.bib_item_id,
        verification_status=body.verification_status,
    )
    session.add(card)
    await session.commit()
    return ok(serialize_evidence(card))


@router.patch("/evidence/{evidence_id}")
async def update_evidence(
    evidence_id: str,
    body: EvidenceUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Patch an evidence card owned by (or reviewable by) the caller."""
    pending = [value for value in (body.claim, body.source_excerpt) if value]
    if pending and contains_sensitive_content("\n".join(pending)):
        raise HTTPException(status_code=400, detail="SENSITIVE_CONTENT")
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    card = await session.get(EvidenceCard, evidence_id)
    if card is None:
        raise HTTPException(status_code=404, detail="EVIDENCE_NOT_FOUND")
    await _owned_submission(session, uuid.UUID(card.submission_id), user_id, role)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(card, key, value)
    await session.commit()
    return ok(serialize_evidence(card))
