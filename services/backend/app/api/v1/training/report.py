"""Class report for staff/TA (``/v1/training/programs/{id}/report``)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import ok
from app.api.v1.training.deps import display_names, global_role, is_program_ta, load_program
from app.api.v1.training.progress import _review_likes, load_curriculum, load_reviews, load_submissions
from app.core.authz import is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment
from app.training.progress import SubmissionLike
from app.training.reporting import build_class_report

router = APIRouter(prefix="/programs/{program_id}/report", tags=["training"])


@router.get("")
async def get_report(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Build the class report payload for staff or the program TA."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    if not is_global_staff(role) and not await is_program_ta(session, user_id, program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    curriculum = await load_curriculum(session, program_id)
    submissions = await load_submissions(session, program_id)
    reviews = await load_reviews(session, submissions)
    review_likes = _review_likes(reviews, submissions)
    enrollments = (
        await session.scalars(
            select(TrainingEnrollment).where(TrainingEnrollment.program_id == program_id)
        )
    ).all()
    names = await display_names(session, [e.learner_id for e in enrollments])

    report = build_class_report(
        curriculum,
        [
            {"learner_id": str(e.learner_id), "status": e.status, "display_name": names.get(str(e.learner_id))}
            for e in enrollments
        ],
        [SubmissionLike(s.task_id, str(s.learner_id), s.status, s.updated_at) for s in submissions],
        review_likes,
    )
    return ok({"program": {"id": str(program.id), "name": program.name, "status": program.status}, **report})
