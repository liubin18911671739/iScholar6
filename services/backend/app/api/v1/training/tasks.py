"""Camp task curriculum for the signed backend API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import global_role, load_program, require_manage, require_read
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingProgramTask

router = APIRouter(prefix="/programs/{program_id}/tasks", tags=["training"])


class ProgramTaskInput(CamelModel):
    task_id: str = Field(min_length=1, max_length=200)
    ordinal: int = 0
    due_at: datetime | None = None
    required: bool = True
    requires_review_override: bool | None = None


class ProgramTasksReplace(CamelModel):
    tasks: list[ProgramTaskInput] = Field(default_factory=list)


def serialize_program_task(task: TrainingProgramTask) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "programId": str(task.program_id),
        "taskId": task.task_id,
        "ordinal": task.ordinal,
        "dueAt": iso(task.due_at),
        "required": task.required,
        "requiresReviewOverride": task.requires_review_override,
        "createdAt": iso(task.created_at),
        "updatedAt": iso(task.updated_at),
    }


@router.get("")
async def list_program_tasks(
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
            select(TrainingProgramTask)
            .where(TrainingProgramTask.program_id == program_id)
            .order_by(TrainingProgramTask.ordinal)
        )
    ).all()
    return ok([serialize_program_task(row) for row in rows])


@router.put("")
async def replace_program_tasks(
    program_id: uuid.UUID,
    body: ProgramTasksReplace,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Replace a camp's curriculum (staff who can manage the camp)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    await session.execute(delete(TrainingProgramTask).where(TrainingProgramTask.program_id == program_id))
    for index, task in enumerate(body.tasks):
        session.add(
            TrainingProgramTask(
                program_id=program_id,
                task_id=task.task_id,
                ordinal=task.ordinal if task.ordinal else index,
                due_at=task.due_at,
                required=task.required,
                requires_review_override=task.requires_review_override,
            )
        )
    await session.commit()

    rows = (
        await session.scalars(
            select(TrainingProgramTask)
            .where(TrainingProgramTask.program_id == program_id)
            .order_by(TrainingProgramTask.ordinal)
        )
    ).all()
    return ok([serialize_program_task(row) for row in rows])
