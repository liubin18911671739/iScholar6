"""Project CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Project

router = APIRouter(prefix="/projects", tags=["data"])


class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=20_000)
    discipline: str | None = Field(default=None, max_length=240)
    goal: str | None = Field(default=None, max_length=20_000)
    metadata: dict[str, Any] | None = None


class ProjectUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    status: str | None = Field(default=None, max_length=32)
    discipline: str | None = Field(default=None, max_length=240)
    goal: str | None = None
    metadata: dict[str, Any] | None = None


def serialize_project(project: Project) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "discipline": project.discipline,
        "goal": project.goal,
        "encryptionKeyRef": project.encryption_key_ref,
        "metadata": project.metadata_,
        "createdAt": iso(project.created_at),
        "updatedAt": iso(project.updated_at),
    }


@router.get("")
async def list_projects(
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)
):
    owner_id = identity_uuid(identity)
    rows = (
        await session.scalars(
            select(Project).where(Project.owner_id == owner_id).order_by(Project.updated_at.desc())
        )
    ).all()
    return ok([serialize_project(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    project = Project(
        owner_id=identity_uuid(identity),
        name=body.name,
        description=body.description,
        discipline=body.discipline,
        goal=body.goal,
        metadata_=body.metadata or {},
    )
    session.add(project)
    await session.commit()
    return ok(serialize_project(project))


@router.get("/{project_id}")
async def get_project(
    project_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    project = await owned_project(session, project_id, identity_uuid(identity))
    return ok(serialize_project(project))


@router.patch("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    project = await owned_project(session, project_id, identity_uuid(identity))
    fields = body.model_dump(exclude_unset=True)
    if "metadata" in fields and fields["metadata"] is not None:
        project.metadata_ = fields.pop("metadata")
    for key, value in fields.items():
        if value is not None:
            setattr(project, key, value)
    await session.commit()
    return ok(serialize_project(project))


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    project = await owned_project(session, project_id, identity_uuid(identity))
    await session.delete(project)
    await session.commit()
    return ok({"id": str(project_id)})
