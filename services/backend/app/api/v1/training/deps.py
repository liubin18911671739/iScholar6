"""Access-resolution helpers for the training API.

RLS used to enforce camp/org authorization; with plain Postgres the API layer
resolves the caller's program access here and applies the pure policy from
``app.core.authz``.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import resolve_role
from app.core.authz import can_manage_program, can_read_program, can_review_submission
from app.models import OrganizationMember, TrainingEnrollment, TrainingProgram


async def global_role(session: AsyncSession, user_id: uuid.UUID) -> str | None:
    """Read the caller's global role from the Auth.js ``users`` table."""
    return await resolve_role(session, user_id)


async def org_role(session: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID | None) -> str | None:
    """Read the caller's role in an organization, if any."""
    if org_id is None:
        return None
    return await session.scalar(
        select(OrganizationMember.role).where(
            OrganizationMember.org_id == org_id, OrganizationMember.user_id == user_id
        )
    )


async def is_program_ta(session: AsyncSession, user_id: uuid.UUID, program_id: uuid.UUID) -> bool:
    """True when the caller is an active teaching assistant for the program."""
    row = await session.scalar(
        select(TrainingEnrollment.id).where(
            TrainingEnrollment.program_id == program_id,
            TrainingEnrollment.learner_id == user_id,
            TrainingEnrollment.role == "ta",
            TrainingEnrollment.status == "active",
        )
    )
    return row is not None


async def is_enrolled(session: AsyncSession, user_id: uuid.UUID, program_id: uuid.UUID) -> bool:
    """True when the caller has a non-removed enrollment in the program."""
    row = await session.scalar(
        select(TrainingEnrollment.id).where(
            TrainingEnrollment.program_id == program_id,
            TrainingEnrollment.learner_id == user_id,
            TrainingEnrollment.status != "removed",
        )
    )
    return row is not None


async def load_program(session: AsyncSession, program_id: uuid.UUID) -> TrainingProgram:
    """Load a program or raise 404."""
    program = await session.get(TrainingProgram, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="PROGRAM_NOT_FOUND")
    return program


async def can_manage(session: AsyncSession, role: str | None, user_id: uuid.UUID, program: TrainingProgram) -> bool:
    """Whether the caller may administer the program (mirrors ``can_manage_program``)."""
    return can_manage_program(
        role,
        owner_id=program.owner_id,
        user_id=user_id,
        has_org=program.organization_id is not None,
        org_role=await org_role(session, user_id, program.organization_id),
    )


async def require_manage(session: AsyncSession, role: str | None, user_id: uuid.UUID, program: TrainingProgram) -> None:
    """Raise 403 unless the caller may administer the program."""
    if not await can_manage(session, role, user_id, program):
        raise HTTPException(status_code=403, detail="FORBIDDEN")


async def require_read(session: AsyncSession, role: str | None, user_id: uuid.UUID, program: TrainingProgram) -> None:
    """Raise 404 unless the caller can read the program (hide existence)."""
    manageable = await can_manage(session, role, user_id, program)
    allowed = can_read_program(
        can_manage=manageable,
        is_program_ta=await is_program_ta(session, user_id, program.id),
        is_enrolled=await is_enrolled(session, user_id, program.id),
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="PROGRAM_NOT_FOUND")


async def can_review(session: AsyncSession, role: str | None, user_id: uuid.UUID, program_id: uuid.UUID) -> bool:
    """Staff or the program's TA may review submissions."""
    return can_review_submission(role, is_program_ta=await is_program_ta(session, user_id, program_id))


async def display_names(session: AsyncSession, user_ids: list[uuid.UUID]) -> dict[str, str | None]:
    """Read display names from the web-owned ``users`` table (read-only)."""
    if not user_ids:
        return {}
    rows = await session.execute(
        text("SELECT id::text, name FROM users WHERE id::text = ANY(:ids)"),
        {"ids": [str(uid) for uid in user_ids]},
    )
    return {row[0]: row[1] for row in rows}


async def ta_program_ids(session: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    """Programs where the caller is an active TA."""
    rows = await session.scalars(
        select(TrainingEnrollment.program_id).where(
            TrainingEnrollment.learner_id == user_id,
            TrainingEnrollment.role == "ta",
            TrainingEnrollment.status == "active",
        )
    )
    return list(rows.all())
