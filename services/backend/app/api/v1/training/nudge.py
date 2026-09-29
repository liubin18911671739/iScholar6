"""Lightweight camp nudge (``/v1/training/programs/{id}/nudge``)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, ok
from app.api.v1.training.deps import global_role, load_program, require_staff_or_ta
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment

router = APIRouter(prefix="/programs/{program_id}/nudge", tags=["training"])


class NudgeBody(CamelModel):
    learner_ids: list[uuid.UUID] | None = Field(default=None, max_length=200)
    all_active: bool = False


@router.post("")
async def nudge(
    program_id: uuid.UUID,
    body: NudgeBody,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Stamp ``last_nudged_at`` on active enrollments (staff or program TA)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_staff_or_ta(session, role, user_id, program)
    if not body.learner_ids and not body.all_active:
        raise HTTPException(status_code=422, detail="VALIDATION_ERROR")

    stmt = select(TrainingEnrollment).where(
        TrainingEnrollment.program_id == program_id, TrainingEnrollment.status == "active"
    )
    if body.learner_ids:
        stmt = stmt.where(TrainingEnrollment.learner_id.in_(body.learner_ids))
    enrollments = (await session.scalars(stmt)).all()
    nudged_at = datetime.now(UTC)
    for enrollment in enrollments:
        enrollment.last_nudged_at = nudged_at
    await session.commit()

    return ok(
        [
            {"id": str(e.id), "learnerId": str(e.learner_id), "lastNudgedAt": nudged_at.isoformat()}
            for e in enrollments
        ]
    )
