"""Journal submission CRUD for the signed backend data API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok, owned_manuscript, owned_submission
from app.api.v1.deps import identity_uuid, owned_project
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import Submission

router = APIRouter(prefix="/submissions", tags=["data"])


class SubmissionCreate(CamelModel):
    project_id: uuid.UUID
    manuscript_id: uuid.UUID
    journal_name: str = Field(min_length=1, max_length=400)
    cover_letter: str | None = None
    file_tree: dict[str, Any] | None = None
    submitted_at: datetime | None = None
    status: str | None = Field(default=None, max_length=32)


class SubmissionUpdate(CamelModel):
    journal_name: str | None = Field(default=None, min_length=1, max_length=400)
    cover_letter: str | None = None
    file_tree: dict[str, Any] | None = None
    submitted_at: datetime | None = None
    status: str | None = Field(default=None, max_length=32)


def serialize_submission(submission: Submission) -> dict[str, Any]:
    return {
        "id": str(submission.id),
        "projectId": str(submission.project_id),
        "manuscriptId": str(submission.manuscript_id),
        "journalName": submission.journal_name,
        "coverLetter": submission.cover_letter,
        "fileTree": submission.file_tree,
        "submittedAt": iso(submission.submitted_at),
        "status": submission.status,
    }


@router.get("")
async def list_submissions(
    project_id: uuid.UUID = Query(alias="projectId"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    await owned_project(session, project_id, identity_uuid(identity))
    rows = (
        await session.scalars(
            select(Submission).where(Submission.project_id == project_id).order_by(Submission.journal_name)
        )
    ).all()
    return ok([serialize_submission(row) for row in rows])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_submission(
    body: SubmissionCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    await owned_project(session, body.project_id, owner_id)
    manuscript = await owned_manuscript(session, body.manuscript_id, owner_id)
    if manuscript.project_id != body.project_id:
        raise HTTPException(status_code=400, detail="MANUSCRIPT_PROJECT_MISMATCH")
    submission = Submission(
        project_id=body.project_id,
        manuscript_id=body.manuscript_id,
        journal_name=body.journal_name,
        cover_letter=body.cover_letter,
        file_tree=body.file_tree or {},
        submitted_at=body.submitted_at,
        status=body.status,
    )
    session.add(submission)
    await session.commit()
    return ok(serialize_submission(submission))


@router.patch("/{submission_id}")
async def update_submission(
    submission_id: uuid.UUID,
    body: SubmissionUpdate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    submission = await owned_submission(session, submission_id, identity_uuid(identity))
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(submission, key, value)
    await session.commit()
    return ok(serialize_submission(submission))


@router.delete("/{submission_id}")
async def delete_submission(
    submission_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    submission = await owned_submission(session, submission_id, identity_uuid(identity))
    await session.delete(submission)
    await session.commit()
    return ok({"id": str(submission_id)})
