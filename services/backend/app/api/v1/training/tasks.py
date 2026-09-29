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
from app.training.catalog import BUILTIN_TASKS
from app.training.progress import ProgramTaskConfig, resolve_program_curriculum

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
    return ok(curriculum_envelope(rows))


def curriculum_envelope(rows: list[TrainingProgramTask]) -> dict[str, Any]:
    """Camp curriculum envelope: raw rows + resolved catalog (legacy parity)."""
    configs = [
        ProgramTaskConfig(
            task_id=row.task_id,
            ordinal=row.ordinal,
            due_at=row.due_at,
            required=row.required,
            requires_review_override=row.requires_review_override,
        )
        for row in rows
    ]
    curriculum = resolve_program_curriculum(configs)
    return {
        "configured": len(rows) > 0,
        "rows": [serialize_program_task(row) for row in rows],
        "catalogSize": len(BUILTIN_TASKS),
        "available": True,
        "curriculum": [
            {
                "taskId": cfg.task_id,
                "ordinal": cfg.ordinal,
                "dueAt": iso(cfg.due_at),
                "required": cfg.required,
                "requiresReviewOverride": cfg.requires_review_override,
                "title": definition.title,
                "description": definition.description,
                "agent": definition.agent,
                "dimension": definition.dimension,
                "steps": list(definition.steps),
                "requiresReview": (
                    cfg.requires_review_override
                    if cfg.requires_review_override is not None
                    else definition.requires_review
                ),
            }
            for cfg, definition in curriculum
        ],
    }


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
