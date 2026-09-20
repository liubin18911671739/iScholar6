"""Minimal project API; other domain APIs share this authorization pattern."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.agent import identity_uuid
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Project

router = APIRouter(prefix="/data/projects", tags=["data"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=20_000)


@router.get("")
async def list_projects(identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    owner_id = identity_uuid(identity)
    rows = (await session.scalars(select(Project).where(Project.owner_id == owner_id).order_by(Project.updated_at.desc()))).all()
    return {"ok": True, "data": [{"id": str(row.id), "name": row.name, "description": row.description, "createdAt": row.created_at.isoformat()} for row in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    project = Project(owner_id=identity_uuid(identity), name=body.name, description=body.description)
    session.add(project)
    await session.commit()
    return {"ok": True, "data": {"id": str(project.id), "name": project.name}}
