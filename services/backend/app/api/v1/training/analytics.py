"""Training analytics dashboard (``/v1/training/analytics/dashboard``)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import ok
from app.api.v1.training.deps import global_role, ta_program_ids
from app.core.authz import OrgRole, is_global_admin, is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import (
    OrganizationMember,
    TrainingEnrollment,
    TrainingProgram,
    TrainingReview,
    TrainingSubmission,
)

router = APIRouter(prefix="/analytics/dashboard", tags=["training"])


async def _visible_program_ids(session: AsyncSession, user_id, role: str | None) -> list:
    if is_global_admin(role):
        return list((await session.scalars(select(TrainingProgram.id))).all())
    conditions = []
    conditions.append(TrainingProgram.owner_id == user_id)
    org_ids = select(OrganizationMember.org_id).where(
        OrganizationMember.user_id == user_id,
        OrganizationMember.role.in_([OrgRole.ORG_ADMIN.value, OrgRole.LIBRARIAN.value]),
    )
    conditions.append(TrainingProgram.organization_id.in_(org_ids))
    ta_ids = await ta_program_ids(session, user_id)
    if ta_ids:
        conditions.append(TrainingProgram.id.in_(ta_ids))
    if is_global_staff(role):
        conditions.append(TrainingProgram.organization_id.is_(None))
    from sqlalchemy import or_

    return list((await session.scalars(select(TrainingProgram.id).where(or_(*conditions)))).all())


@router.get("")
async def dashboard(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    """Aggregate training metrics across the caller's visible programs."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program_ids = await _visible_program_ids(session, user_id, role)

    if not program_ids:
        return ok(
            {
                "programs": 0,
                "activeEnrollments": 0,
                "submissions": {"total": 0, "submitted": 0, "needsReview": 0, "completed": 0, "escalated": 0},
                "reviews": 0,
                "byProgram": [],
            }
        )

    active_enrollments = await session.scalar(
        select(func.count())
        .select_from(TrainingEnrollment)
        .where(TrainingEnrollment.program_id.in_(program_ids), TrainingEnrollment.status == "active")
    )

    status_rows = (
        await session.execute(
            select(TrainingSubmission.status, func.count())
            .where(TrainingSubmission.program_id.in_(program_ids))
            .group_by(TrainingSubmission.status)
        )
    ).all()
    status_counts = {status: count for status, count in status_rows}
    total_submissions = sum(status_counts.values())
    reviews = await session.scalar(
        select(func.count())
        .select_from(TrainingReview)
        .where(
            TrainingReview.submission_id.in_(
                select(TrainingSubmission.id).where(TrainingSubmission.program_id.in_(program_ids))
            )
        )
    )

    by_program: list[dict[str, Any]] = []
    for program in (await session.scalars(select(TrainingProgram).where(TrainingProgram.id.in_(program_ids)))).all():
        enrolled = await session.scalar(
            select(func.count())
            .select_from(TrainingEnrollment)
            .where(TrainingEnrollment.program_id == program.id, TrainingEnrollment.status == "active")
        )
        by_program.append(
            {
                "programId": str(program.id),
                "name": program.name,
                "status": program.status,
                "activeEnrollments": enrolled or 0,
            }
        )

    return ok(
        {
            "programs": len(program_ids),
            "activeEnrollments": active_enrollments or 0,
            "submissions": {
                "total": total_submissions,
                "submitted": status_counts.get("submitted", 0),
                "needsReview": status_counts.get("needs_review", 0),
                "completed": status_counts.get("completed", 0),
                "escalated": status_counts.get("escalated", 0),
            },
            "reviews": reviews or 0,
            "byProgram": by_program,
        }
    )
