"""Program export for staff/TA (``/v1/training/programs/{id}/export``)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import iso
from app.api.v1.training.deps import can_manage, display_names, global_role, is_program_ta, load_program
from app.api.v1.training.progress import _review_likes, load_curriculum, load_reviews, load_submissions
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment
from app.training.export import redact_email, redact_id, to_csv
from app.training.progress import SubmissionLike, build_class_progress

router = APIRouter(prefix="/programs/{program_id}/export", tags=["training"])


def _gradebook_rows(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for member in members:
        task_scores = {task["taskId"]: task.get("score") for task in member["tasks"]}
        scored = [s for s in task_scores.values() if isinstance(s, int)]
        rows.append(
            {
                "learnerId": member["learnerId"],
                "displayName": member.get("displayName"),
                "overall": round(sum(scored) / len(scored)) if scored else None,
                "status": member.get("status"),
                "taskScores": task_scores,
                "completedAt": None,
            }
        )
    return rows


@router.get("")
async def export_program(
    program_id: uuid.UUID,
    scope: str = Query(default="members"),
    format: str = Query(default="json"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Export members / submissions / reviews / gradebook as JSON or CSV."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    staff = await can_manage(session, role, user_id, program)
    if not staff and not await is_program_ta(session, user_id, program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")
    redact = not staff
    if format not in {"json", "csv"}:
        raise HTTPException(status_code=422, detail="INVALID_FORMAT")

    enrollments = (
        await session.scalars(
            select(TrainingEnrollment).where(TrainingEnrollment.program_id == program_id)
        )
    ).all()
    names = await display_names(session, [e.learner_id for e in enrollments])
    submissions = await load_submissions(session, program_id)
    reviews = await load_reviews(session, submissions)

    if scope == "members":
        rows: list[dict[str, Any]] = [
            {
                "enrollment_id": str(e.id),
                "learner_id": redact_id(str(e.learner_id)) if redact else str(e.learner_id),
                "display_name": names.get(str(e.learner_id)),
                "email": None,
                "role": e.role,
                "status": e.status,
                "joined_at": iso(e.joined_at),
            }
            for e in enrollments
        ]
    elif scope == "submissions":
        rows = [
            {
                "submission_id": str(s.id),
                "program_id": str(s.program_id),
                "task_id": s.task_id,
                "learner_id": redact_id(str(s.learner_id)) if redact else str(s.learner_id),
                "status": s.status,
                "answers": s.answers,
                "reflection": s.reflection,
                "updated_at": iso(s.updated_at),
            }
            for s in submissions
        ]
    elif scope == "reviews":
        rows = [
            {
                "review_id": str(r.id),
                "submission_id": str(r.submission_id),
                "reviewer_id": redact_id(str(r.reviewer_id)) if redact else str(r.reviewer_id),
                "decision": r.decision,
                "feedback": r.feedback,
                "score": r.score,
                "created_at": iso(r.created_at),
            }
            for r in reviews
        ]
    elif scope == "gradebook":
        curriculum = await load_curriculum(session, program_id)
        members = build_class_progress(
            curriculum,
            [
                {"learner_id": str(e.learner_id), "status": e.status, "display_name": names.get(str(e.learner_id))}
                for e in enrollments
            ],
            [SubmissionLike(s.task_id, str(s.learner_id), s.status, s.updated_at) for s in submissions],
            _review_likes(reviews, submissions),
        )
        rows = []
        for row in _gradebook_rows(members):
            rows.append(
                {
                    **row,
                    "learnerId": redact_id(row["learnerId"]) if redact else row["learnerId"],
                    "email": redact_email(None),
                }
            )
    else:
        raise HTTPException(status_code=422, detail="INVALID_SCOPE")

    if format == "csv":
        safe_name = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", program.name)
        stamp = datetime.now(UTC).date().isoformat()
        filename = f"training-{safe_name}-{scope}-{stamp}.csv"
        return Response(
            content=to_csv(rows),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return {
        "ok": True,
        "program": {"id": str(program.id), "name": program.name},
        "scope": scope,
        "redact": redact,
        "exportedAt": datetime.now(UTC).isoformat(),
        "rows": rows,
    }
