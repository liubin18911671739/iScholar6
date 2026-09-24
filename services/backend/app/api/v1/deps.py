"""Shared FastAPI dependencies and helpers for the v1 API."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Identity
from app.models import Project


def identity_uuid(identity: Identity) -> uuid.UUID:
    """Parse the signed service user id into a UUID."""
    try:
        return uuid.UUID(identity.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="INVALID_SERVICE_USER") from exc


async def resolve_role(session: AsyncSession, user_id: uuid.UUID) -> str | None:
    """Read the caller's global role from the Auth.js ``users`` table (read-only)."""
    return await session.scalar(text("SELECT role FROM users WHERE id = :uid"), {"uid": str(user_id)})


async def owned_project(session: AsyncSession, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project:
    """Load a project owned by the caller, or raise 404."""
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.owner_id == owner_id))
    if not project:
        raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")
    return project
