"""Program progress for learners and staff/TA (``/v1/training/programs/{id}/progress``)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import ok
from app.api.v1.training.deps import (
    display_names,
    global_role,
    is_enrolled,
    is_program_ta,
    load_program,
)
from app.core.authz import is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment, TrainingProgramTask, TrainingReview, TrainingSubmission
from app.training.progress import (
    ProgramTaskConfig,
    ReviewLike,
    SubmissionLike,
    build_class_progress,
    build_learner_progress,
    resolve_program_curriculum,
)

router = APIRouter(prefix="/programs/{program_id}/progress", tags=["training"])


async def load_curriculum(session: AsyncSession, program_id: uuid.UUID) -> list[ProgramTaskConfig]:
    rows = (
        await session.scalars(
            select(TrainingProgramTask)
            .where(TrainingProgramTask.program_id == program_id)
            .order_by(TrainingProgramTask.ordinal)
        )
    ).all()
    return [
        ProgramTaskConfig(
            task_id=row.task_id,
            ordinal=row.ordinal,
            due_at=row.due_at,
            required=row.required,
            requires_review_override=row.requires_review_override,
        )
        for row in rows
    ]


async def load_submissions(session: AsyncSession, program_id: uuid.UUID) -> list[TrainingSubmission]:
    return list(
        (
            await session.scalars(
                select(TrainingSubmission).where(TrainingSubmission.program_id == program_id)
            )
        ).all()
    )


async def load_reviews(session: AsyncSession, submissions: list[TrainingSubmission]) -> list[TrainingReview]:
    submission_ids = [s.id for s in submissions]
    if not submission_ids:
        return []
    return list(
        (
            await session.scalars(
                select(TrainingReview).where(TrainingReview.submission_id.in_(submission_ids))
            )
        ).all()
    )


def _review_likes(
    reviews: list[TrainingReview], submissions: list[TrainingSubmission]
) -> list[ReviewLike]:
    meta = {s.id: (s.learner_id, s.task_id) for s in submissions}
    likes: list[ReviewLike] = []
    for review in reviews:
        entry = meta.get(review.submission_id)
        if entry is None:
            continue
        learner_id, task_id = entry
        likes.append(
            ReviewLike(
                task_id=task_id,
                learner_id=str(learner_id),
                decision=review.decision,
                created_at=review.created_at,
                score=review.score,
                reviewer_id=str(review.reviewer_id),
                submission_id=str(review.submission_id),
            )
        )
    return likes


@router.get("")
async def get_progress(
    program_id: uuid.UUID,
    learner_id: uuid.UUID | None = Query(default=None, alias="learnerId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Self progress for learners; class progress for staff and the camp TA."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    await load_program(session, program_id)
    staff = is_global_staff(role)
    ta = await is_program_ta(session, user_id, program_id)
    can_view_class = staff or ta

    if not can_view_class and not await is_enrolled(session, user_id, program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    curriculum = resolve_program_curriculum(await load_curriculum(session, program_id))
    submissions = await load_submissions(session, program_id)
    reviews = await load_reviews(session, submissions)
    review_likes = _review_likes(reviews, submissions)

    if not can_view_class:
        own = [s for s in submissions if s.learner_id == user_id]
        reviews_by_task: dict[str, ReviewLike] = {}
        for review in review_likes:
            if review.learner_id != str(user_id):
                continue
            existing = reviews_by_task.get(review.task_id)
            if existing is None or review.created_at > existing.created_at:
                reviews_by_task[review.task_id] = review
        progress = build_learner_progress(
            curriculum,
            [SubmissionLike(s.task_id, str(s.learner_id), s.status, s.updated_at) for s in own],
            reviews_by_task,
        )
        return ok(
            {
                "scope": "self",
                "tasks": progress.tasks,
                "completionRate": progress.completion_rate,
                "requiredTotal": progress.required_total,
                "requiredDone": progress.required_done,
            }
        )

    enrollments = (
        await session.scalars(
            select(TrainingEnrollment).where(TrainingEnrollment.program_id == program_id)
        )
    ).all()
    names = await display_names(session, [e.learner_id for e in enrollments])
    class_rows = build_class_progress(
        curriculum,
        [
            {"learner_id": str(e.learner_id), "status": e.status, "display_name": names.get(str(e.learner_id))}
            for e in enrollments
        ],
        [SubmissionLike(s.task_id, str(s.learner_id), s.status, s.updated_at) for s in submissions],
        review_likes,
    )
    filtered = [row for row in class_rows if str(row["learnerId"]) == str(learner_id)] if learner_id else class_rows

    curriculum_payload: list[dict[str, Any]] = [
        {
            "taskId": cfg.task_id,
            "title": definition.title,
            "ordinal": cfg.ordinal,
            "dueAt": cfg.due_at.isoformat() if cfg.due_at else None,
            "required": cfg.required,
        }
        for cfg, definition in curriculum
    ]
    return ok(
        {
            "scope": "class",
            "access": "staff" if staff else "ta",
            "curriculum": curriculum_payload,
            "members": filtered,
        }
    )
