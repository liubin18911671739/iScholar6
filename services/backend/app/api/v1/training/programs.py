"""Training program (camp) CRUD for the signed backend API."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, iso_date, ok
from app.api.v1.training.deps import global_role, load_program, require_manage, require_read
from app.core.authz import OrgRole, is_global_admin, is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import OrganizationMember, TrainingEnrollment, TrainingProgram

router = APIRouter(prefix="/programs", tags=["training"])


class ProgramCreate(CamelModel):
    name: str = Field(min_length=1, max_length=400)
    description: str | None = None
    discipline: str | None = Field(default=None, max_length=240)
    cohort_name: str | None = Field(default=None, max_length=240)
    start_date: date | None = None
    end_date: date | None = None
    max_members: int | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, max_length=32)
    organization_id: uuid.UUID | None = None


class ProgramUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=400)
    description: str | None = None
    discipline: str | None = Field(default=None, max_length=240)
    cohort_name: str | None = Field(default=None, max_length=240)
    start_date: date | None = None
    end_date: date | None = None
    max_members: int | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, max_length=32)
    organization_id: uuid.UUID | None = None


def serialize_program(program: TrainingProgram) -> dict[str, Any]:
    return {
        "id": str(program.id),
        "name": program.name,
        "description": program.description,
        "discipline": program.discipline,
        "ownerId": str(program.owner_id),
        "cohortName": program.cohort_name,
        "startDate": iso_date(program.start_date),
        "endDate": iso_date(program.end_date),
        "maxMembers": program.max_members,
        "status": program.status,
        "organizationId": str(program.organization_id) if program.organization_id else None,
        "createdAt": iso(program.created_at),
        "updatedAt": iso(program.updated_at),
    }


@router.get("")
async def list_programs(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """List programs the caller can read (admin: all; staff/TA/learner: scoped)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)

    stmt = select(TrainingProgram).order_by(TrainingProgram.updated_at.desc())
    if not is_global_admin(role):
        staff_org_ids = select(OrganizationMember.org_id).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.role.in_([OrgRole.ORG_ADMIN.value, OrgRole.LIBRARIAN.value]),
        )
        enrolled_program_ids = select(TrainingEnrollment.program_id).where(
            TrainingEnrollment.learner_id == user_id, TrainingEnrollment.status != "removed"
        )
        conditions = [
            TrainingProgram.owner_id == user_id,
            TrainingProgram.organization_id.in_(staff_org_ids),
            TrainingProgram.id.in_(enrolled_program_ids),
        ]
        if is_global_staff(role):
            conditions.append(TrainingProgram.organization_id.is_(None))
        stmt = stmt.where(or_(*conditions))

    rows = (await session.scalars(stmt)).all()
    return ok([serialize_program(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_program(
    body: ProgramCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Create a camp (global staff only, mirroring the legacy route guard)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    if not is_global_staff(role):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    program = TrainingProgram(
        name=body.name,
        description=body.description,
        discipline=body.discipline,
        owner_id=user_id,
        cohort_name=body.cohort_name,
        start_date=body.start_date,
        end_date=body.end_date,
        max_members=body.max_members,
        status=body.status or "draft",
        organization_id=body.organization_id,
    )
    session.add(program)
    await session.commit()
    return ok(serialize_program(program))


@router.get("/{program_id}")
async def get_program(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_read(session, role, user_id, program)
    return ok(serialize_program(program))


@router.patch("/{program_id}")
async def update_program(
    program_id: uuid.UUID,
    body: ProgramUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(program, key, value)
    await session.commit()
    return ok(serialize_program(program))


@router.delete("/{program_id}")
async def archive_program(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Archive a program (soft delete); hard deletion is intentionally unsupported."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)
    program.status = "archived"
    await session.commit()
    return ok(serialize_program(program))
