"""Training analytics dashboard (``/v1/training/analytics/dashboard``).

Port of the legacy cross-program semester dashboard + risk heatmap
(``lib/training/reporting-v2.ts``).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import ok
from app.api.v1.training.deps import display_names, global_role, ta_program_ids
from app.core.authz import OrgRole, is_global_admin, is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import (
    OrganizationMember,
    TrainingEnrollment,
    TrainingProgram,
    TrainingProgramTask,
    TrainingReview,
    TrainingSubmission,
)
from app.training.progress import ProgramTaskConfig, ReviewLike, SubmissionLike
from app.training.reporting import build_class_report
from app.training.reporting_v2 import build_risk_heatmap, build_semester_dashboard

router = APIRouter(prefix="/analytics/dashboard", tags=["training"])

_MAX_PROGRAMS = 30


async def _visible_program_ids(session: AsyncSession, user_id: uuid.UUID, role: str | None) -> list[uuid.UUID]:
    if is_global_admin(role):
        return list((await session.scalars(select(TrainingProgram.id))).all())
    conditions: list[Any] = [TrainingProgram.owner_id == user_id]
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
    return list((await session.scalars(select(TrainingProgram.id).where(or_(*conditions)))).all())


async def _load_snapshot(
    session: AsyncSession, program: TrainingProgram
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build one program snapshot (class report) plus its flattened reviews."""
    configs = (
        await session.scalars(
            select(TrainingProgramTask)
            .where(TrainingProgramTask.program_id == program.id)
            .order_by(TrainingProgramTask.ordinal)
        )
    ).all()
    enrollments = (
        await session.scalars(
            select(TrainingEnrollment).where(TrainingEnrollment.program_id == program.id)
        )
    ).all()
    submissions = (
        await session.scalars(
            select(TrainingSubmission).where(TrainingSubmission.program_id == program.id)
        )
    ).all()
    submission_ids = [submission.id for submission in submissions]
    reviews = (
        await session.scalars(
            select(TrainingReview).where(TrainingReview.submission_id.in_(submission_ids))
        )
    ).all() if submission_ids else []

    names = await display_names(session, [enrollment.learner_id for enrollment in enrollments])
    meta = {str(submission.id): (str(submission.learner_id), submission.task_id) for submission in submissions}

    config_objs = [
        ProgramTaskConfig(
            task_id=config.task_id,
            ordinal=config.ordinal,
            due_at=config.due_at,
            required=config.required,
            requires_review_override=config.requires_review_override,
        )
        for config in configs
    ]
    submission_likes = [
        SubmissionLike(submission.task_id, str(submission.learner_id), submission.status, submission.updated_at)
        for submission in submissions
    ]

    review_likes: list[ReviewLike] = []
    flat_reviews: list[dict[str, Any]] = []
    for review in reviews:
        learner_id, task_id = meta.get(str(review.submission_id), (None, None))
        if learner_id is None or task_id is None:
            continue
        review_likes.append(
            ReviewLike(
                task_id=task_id,
                learner_id=learner_id,
                decision=review.decision,
                created_at=review.created_at,
                score=review.score,
                reviewer_id=str(review.reviewer_id),
                submission_id=str(review.submission_id),
            )
        )
        flat_reviews.append({"reviewer_id": str(review.reviewer_id), "decision": review.decision, "score": review.score})

    report = build_class_report(
        config_objs,
        [
            {"learner_id": str(enrollment.learner_id), "status": enrollment.status, "display_name": names.get(str(enrollment.learner_id))}
            for enrollment in enrollments
        ],
        submission_likes,
        review_likes,
    )
    snapshot = {
        "programId": str(program.id),
        "name": program.name,
        "status": program.status,
        "cohortName": program.cohort_name,
        "startDate": program.start_date.isoformat() if program.start_date else None,
        "endDate": program.end_date.isoformat() if program.end_date else None,
        "report": report,
    }
    return snapshot, flat_reviews


def _overlaps(program: TrainingProgram, window_from: str, window_to: str) -> bool:
    start = program.start_date.isoformat() if program.start_date else None
    end = program.end_date.isoformat() if program.end_date else None
    if not start and not end:
        return True
    if start and start > window_to:
        return False
    if end and end < window_from:
        return False
    return True


@router.get("")
async def dashboard(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    heatmap_program_id: uuid.UUID | None = Query(default=None, alias="heatmapProgramId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Aggregate a semester dashboard + risk heatmap across visible programs."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    access = "staff" if is_global_staff(role) else "ta"

    today = date.today()
    window_from = from_ or date(today.year, 1, 1).isoformat()
    window_to = to or today.isoformat()

    program_ids = await _visible_program_ids(session, user_id, role)
    if not program_ids:
        return ok(
            {
                "window": {"from": window_from, "to": window_to},
                "programs": [],
                "totals": {"programs": 0, "members": 0, "pendingReviews": 0, "avgCompletionRate": 0},
                "reviewerKpis": [],
                "heatmap": None,
                "access": access,
            }
        )

    programs = (
        await session.scalars(
            select(TrainingProgram)
            .where(TrainingProgram.id.in_(program_ids))
            .order_by(TrainingProgram.updated_at.desc())
        )
    ).all()
    in_window = [program for program in programs if _overlaps(program, window_from, window_to)][:_MAX_PROGRAMS]

    snapshots: list[dict[str, Any]] = []
    all_reviews: list[dict[str, Any]] = []
    for program in in_window:
        snapshot, reviews = await _load_snapshot(session, program)
        snapshots.append(snapshot)
        all_reviews.extend(reviews)

    dashboard_data = build_semester_dashboard(
        from_date=window_from, to_date=window_to, snapshots=snapshots, reviews=all_reviews
    )

    heatmap = None
    heat_id = str(heatmap_program_id) if heatmap_program_id else (snapshots[0]["programId"] if snapshots else None)
    if heat_id:
        snapshot = next((snap for snap in snapshots if snap["programId"] == heat_id), None)
        if snapshot is not None:
            report = snapshot["report"]
            learners = [
                {"learnerId": risk["learnerId"], "displayName": risk["displayName"]} for risk in report["risk"]
            ]
            task_ids = [task["taskId"] for task in report["byTask"]]
            cells = [
                {
                    "learnerId": risk["learnerId"],
                    "taskId": task["taskId"],
                    "revisionCount": risk["revisionCount"],
                    "escalatedCount": risk["escalatedCount"],
                }
                for risk in report["risk"]
                for task in report["byTask"]
            ]
            heatmap = build_risk_heatmap(learners=learners, task_ids=task_ids, cells=cells)

    return ok({**dashboard_data, "heatmap": heatmap, "access": access})
