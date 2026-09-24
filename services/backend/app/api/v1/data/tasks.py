"""Project task CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, ok, owned_task
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Task

router = APIRouter(prefix="/tasks", tags=["data"])


class TaskCreate(CamelModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=400)
    description: str | None = None
    status: str | None = Field(default=None, max_length=32)
    assignee: str | None = Field(default=None, max_length=240)
    due_date: str | None = Field(default=None, max_length=64)
    created_by: str | None = Field(default=None, max_length=240)


class TaskUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=400)
    description: str | None = None
    status: str | None = Field(default=None, max_length=32)
    assignee: str | None = Field(default=None, max_length=240)
    due_date: str | None = Field(default=None, max_length=64)


def serialize_task(task: Task) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "projectId": str(task.project_id),
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "assignee": task.assignee,
        "dueDate": task.due_date,
        "createdBy": task.created_by,
    }


@router.get("")
async def list_tasks(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, project_id, identity_uuid(identity))
    rows = (
        await session.scalars(select(Task).where(Task.project_id == project_id).order_by(Task.title))
    ).all()
    return ok([serialize_task(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, body.project_id, identity_uuid(identity))
    task = Task(
        project_id=body.project_id,
        title=body.title,
        description=body.description,
        status=body.status,
        assignee=body.assignee,
        due_date=body.due_date,
        created_by=body.created_by,
    )
    session.add(task)
    await session.commit()
    return ok(serialize_task(task))


@router.patch("/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    task = await owned_task(session, task_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(task, key, value)
    await session.commit()
    return ok(serialize_task(task))


@router.delete("/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    task = await owned_task(session, task_id, identity_uuid(identity))
    await session.delete(task)
    await session.commit()
    return ok({"id": str(task_id)})
