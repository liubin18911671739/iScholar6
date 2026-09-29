"""iScholar domain MCP tools (``ischolar.*``).

These read backend-owned domain data. Ownership is verified from the caller's
project/owner arguments; the harness and the signed BFF inject the identity.
"""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import Field
from sqlalchemy import select

from app.core.db import SessionLocal
from app.mcp.tools.scholar import ToolParams
from app.models import BibItem, Manuscript, ManuscriptBlock, Project


class ListProjectsParams(ToolParams):
    owner_id: uuid.UUID = Field(description="Owner user id")


class SearchBibliographyParams(ToolParams):
    project_id: uuid.UUID = Field(description="Project id")
    query: str = Field(min_length=1, description="Title/abstract search text")
    limit: int = Field(default=10, ge=1, le=50)
    # Injected by the REST layer from the signed identity; never client-supplied.
    owner_id: uuid.UUID | None = Field(default=None, description="Caller user id (injected)")


class ManuscriptOutlineParams(ToolParams):
    project_id: uuid.UUID = Field(description="Project id")
    # Injected by the REST layer from the signed identity; never client-supplied.
    owner_id: uuid.UUID | None = Field(default=None, description="Caller user id (injected)")


async def _owned_project(session: Any, project_id: uuid.UUID, owner_id: uuid.UUID | None) -> Project:
    """Load a project only when it belongs to the caller. Missing owner never bypasses."""
    if owner_id is None:
        raise ValueError("PROJECT_NOT_FOUND")
    project = await session.get(Project, project_id)
    if project is None or project.owner_id != owner_id:
        raise ValueError("PROJECT_NOT_FOUND")
    return project


async def list_projects(params: ListProjectsParams) -> list[dict[str, Any]]:
    """List the caller's research projects."""
    async with SessionLocal() as session:
        rows = (
            await session.scalars(
                select(Project).where(Project.owner_id == params.owner_id).order_by(Project.updated_at.desc())
            )
        ).all()
        return [
            {
                "id": str(row.id),
                "name": row.name,
                "status": row.status,
                "discipline": row.discipline,
                "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]


async def search_bibliography(params: SearchBibliographyParams) -> list[dict[str, Any]]:
    """Search a project's bibliography by title/abstract substring."""
    async with SessionLocal() as session:
        await _owned_project(session, params.project_id, params.owner_id)
        pattern = f"%{params.query.lower()}%"
        rows = (
            await session.scalars(
                select(BibItem)
                .where(
                    BibItem.project_id == params.project_id,
                    (BibItem.title.ilike(pattern)) | (BibItem.abstract.ilike(pattern)),
                )
                .limit(params.limit)
            )
        ).all()
        return [
            {
                "id": str(row.id),
                "title": row.title,
                "doi": row.doi,
                "authors": row.authors,
                "year": row.year,
                "venue": row.venue,
            }
            for row in rows
        ]


async def manuscript_outline(params: ManuscriptOutlineParams) -> dict[str, Any]:
    """Return a project's manuscripts with their ordered section outline."""
    async with SessionLocal() as session:
        await _owned_project(session, params.project_id, params.owner_id)
        manuscripts = (
            await session.scalars(
                select(Manuscript).where(Manuscript.project_id == params.project_id).order_by(Manuscript.updated_at.desc())
            )
        ).all()
        outline = []
        for manuscript in manuscripts:
            blocks = (
                await session.scalars(
                    select(ManuscriptBlock)
                    .where(ManuscriptBlock.manuscript_id == manuscript.id)
                    .order_by(ManuscriptBlock.ordinal)
                )
            ).all()
            outline.append(
                {
                    "id": str(manuscript.id),
                    "title": manuscript.title,
                    "status": manuscript.status,
                    "sections": [
                        {"section": block.section, "order": block.ordinal, "chars": len(block.content or "")}
                        for block in blocks
                    ],
                }
            )
        return {"projectId": str(params.project_id), "manuscripts": outline}
