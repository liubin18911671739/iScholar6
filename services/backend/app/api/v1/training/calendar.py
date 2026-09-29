"""Training calendar for staff/TA (``/v1/training/calendar``)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import ok
from app.api.v1.training.deps import global_role, ta_program_ids
from app.core.authz import OrgRole, is_global_admin, is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import OrganizationMember, TrainingProgram, TrainingProgramTask
from app.training.calendar import build_month_grid, collect_due_events
from app.training.catalog import task_title

router = APIRouter(prefix="/calendar", tags=["training"])


@router.get("")
async def get_calendar(
    year: int | None = None,
    month: int | None = None,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Return the month grid plus due-task events visible to the caller."""
    if month is not None and not 1 <= month <= 12:
        raise HTTPException(status_code=422, detail="INVALID_MONTH")
    if year is not None and not 1900 <= year <= 3000:
        raise HTTPException(status_code=422, detail="INVALID_YEAR")
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    staff = is_global_staff(role)

    program_filter: list | None = None
    if not staff:
        ta_ids = await ta_program_ids(session, user_id)
        if not ta_ids:
            raise HTTPException(status_code=403, detail="FORBIDDEN")
        program_filter = ta_ids

    now = datetime.now(UTC)
    resolved_year = year or now.year
    resolved_month = month or now.month

    stmt = select(TrainingProgram).where(TrainingProgram.status != "draft")
    if program_filter is not None:
        stmt = stmt.where(TrainingProgram.id.in_(program_filter))
    elif staff and not is_global_admin(role):
        org_ids = select(OrganizationMember.org_id).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.role.in_([OrgRole.ORG_ADMIN.value, OrgRole.LIBRARIAN.value]),
        )
        org_list = list((await session.scalars(org_ids)).all())
        if not org_list:
            return ok({"year": resolved_year, "month": resolved_month, "days": [], "events": [], "access": "staff", "scope": "org"})
        stmt = stmt.where(TrainingProgram.organization_id.in_(org_list))

    programs = (await session.scalars(stmt)).all()
    program_ids = [p.id for p in programs]
    tasks = (
        await session.scalars(
            select(TrainingProgramTask).where(
                TrainingProgramTask.program_id.in_(program_ids),
                TrainingProgramTask.due_at.is_not(None),
            )
        )
    ).all() if program_ids else []

    events = collect_due_events(
        [
            {
                "id": str(p.id),
                "name": p.name,
                "start_date": p.start_date,
                "end_date": p.end_date,
            }
            for p in programs
        ],
        [
            {
                "program_id": str(t.program_id),
                "task_id": t.task_id,
                "due_at": t.due_at,
                "title": task_title(t.task_id),
            }
            for t in tasks
        ],
    )
    days = build_month_grid(resolved_year, resolved_month, events)
    return ok({"year": resolved_year, "month": resolved_month, "days": days, "events": events, "access": "staff" if staff else "ta"})
