"""Camp enrollment (member) management for the signed backend API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import global_role, load_program, require_manage, require_read
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment

router = APIRouter(prefix="/programs/{program_id}/enrollments", tags=["training"])


class EnrollmentUpsert(CamelModel):
    learner_id: uuid.UUID
    role: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, max_length=32)


class EnrollmentUpdate(CamelModel):
    role: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, max_length=32)


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


@router.get("")
async def list_enrollments(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_read(session, role, user_id, program)

    rows = (
        await session.scalars(
            select(TrainingEnrollment)
            .where(TrainingEnrollment.program_id == program_id)
            .order_by(TrainingEnrollment.joined_at)
        )
    ).all()
    return ok([serialize_enrollment(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def upsert_enrollment(
    program_id: uuid.UUID,
    body: EnrollmentUpsert,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Add or reactivate a member (staff who can manage the camp)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    if program.status == "archived":
        raise HTTPException(status_code=409, detail="PROGRAM_NOT_ACCEPTING")
    if program.max_members is not None:
        active = await session.scalar(
            select(func.count())
            .select_from(TrainingEnrollment)
            .where(TrainingEnrollment.program_id == program_id, TrainingEnrollment.status == "active")
        )
        if (active or 0) >= program.max_members:
            raise HTTPException(status_code=409, detail="PROGRAM_FULL")

    enrollment = await session.scalar(
        select(TrainingEnrollment).where(
            TrainingEnrollment.program_id == program_id,
            TrainingEnrollment.learner_id == body.learner_id,
        )
    )
    if enrollment is None:
        enrollment = TrainingEnrollment(
            program_id=program_id,
            learner_id=body.learner_id,
            role=body.role or "learner",
            status=body.status or "active",
        )
        session.add(enrollment)
    else:
        enrollment.status = body.status or "active"
        enrollment.role = body.role or enrollment.role
    await session.commit()
    return ok(serialize_enrollment(enrollment))


@router.patch("/{enrollment_id}")
async def update_enrollment(
    program_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    body: EnrollmentUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    enrollment = await session.get(TrainingEnrollment, enrollment_id)
    if enrollment is None or enrollment.program_id != program_id:
        raise HTTPException(status_code=404, detail="ENROLLMENT_NOT_FOUND")
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(enrollment, key, value)
    await session.commit()
    return ok(serialize_enrollment(enrollment))


@router.delete("/{enrollment_id}")
async def remove_enrollment(
    program_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Soft-remove a member by marking the enrollment removed."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    enrollment = await session.get(TrainingEnrollment, enrollment_id)
    if enrollment is None or enrollment.program_id != program_id:
        raise HTTPException(status_code=404, detail="ENROLLMENT_NOT_FOUND")
    enrollment.status = "removed"
    await session.commit()
    return ok(serialize_enrollment(enrollment))
