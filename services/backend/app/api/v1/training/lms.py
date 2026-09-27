"""Per-program LMS/LTI link + gradebook (``/v1/training/programs/{id}/lms/*``).

AGS score push is not yet ported (see TODO); link CRUD and gradebook export are.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import global_role, load_program, require_manage
from app.api.v1.training.progress import _review_likes, load_curriculum, load_reviews, load_submissions
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment, TrainingLmsLink
from app.training.progress import SubmissionLike, build_class_progress

link_router = APIRouter(prefix="/programs/{program_id}/lms/link", tags=["training"])
gradebook_router = APIRouter(prefix="/programs/{program_id}/lms/gradebook", tags=["training"])


class LmsLinkUpsert(CamelModel):
    platform: str = Field(default="canvas", max_length=32)
    enabled: bool = False
    issuer: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    token_url: str | None = None
    ags_lineitem_url: str | None = None
    deployment_id: str | None = None
    auth_method: str = Field(default="client_secret_post", max_length=32)
    private_key_pem: str | None = None


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    return f"••••{value[-4:]}" if len(value) > 4 else "••••"


def public_link(link: TrainingLmsLink) -> dict[str, Any]:
    return {
        "id": str(link.id),
        "programId": str(link.program_id),
        "platform": link.platform,
        "enabled": link.enabled,
        "issuer": link.issuer,
        "clientId": link.client_id,
        "clientSecret": mask_secret(link.client_secret),
        "hasClientSecret": bool(link.client_secret),
        "tokenUrl": link.token_url,
        "agsLineitemUrl": link.ags_lineitem_url,
        "deploymentId": link.deployment_id,
        "authMethod": link.auth_method,
        "hasPrivateKey": bool(link.private_key_pem),
        "lastPushAt": iso(link.last_push_at),
        "lastPushStatus": link.last_push_status,
        "lastPushError": link.last_push_error,
        "updatedAt": iso(link.updated_at),
    }


@link_router.get("")
async def get_link(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)
    link = await session.scalar(select(TrainingLmsLink).where(TrainingLmsLink.program_id == program_id))
    return ok(public_link(link) if link else None)


@link_router.put("")
async def upsert_link(
    program_id: uuid.UUID,
    body: LmsLinkUpsert,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    if body.platform not in {"canvas", "moodle", "generic"}:
        raise HTTPException(status_code=422, detail="INVALID_PLATFORM")
    if body.auth_method not in {"client_secret_post", "client_secret_basic", "private_key_jwt"}:
        raise HTTPException(status_code=422, detail="INVALID_AUTH_METHOD")

    link = await session.scalar(select(TrainingLmsLink).where(TrainingLmsLink.program_id == program_id))
    if link is None:
        link = TrainingLmsLink(program_id=program_id)
        session.add(link)

    link.platform = body.platform
    link.enabled = body.enabled
    link.issuer = body.issuer
    link.client_id = body.client_id
    link.token_url = body.token_url
    link.ags_lineitem_url = body.ags_lineitem_url
    link.deployment_id = body.deployment_id
    link.auth_method = body.auth_method
    if body.client_secret:
        link.client_secret = body.client_secret
    if body.private_key_pem:
        link.private_key_pem = body.private_key_pem

    if link.enabled and (not link.client_id or not link.token_url or not link.ags_lineitem_url):
        raise HTTPException(status_code=400, detail="LMS_CONFIG_INCOMPLETE")
    if link.enabled and link.auth_method != "private_key_jwt" and not link.client_secret:
        raise HTTPException(status_code=400, detail="CLIENT_SECRET_REQUIRED")
    if link.enabled and link.auth_method == "private_key_jwt" and not link.private_key_pem:
        raise HTTPException(status_code=400, detail="PRIVATE_KEY_REQUIRED")

    await session.commit()
    return ok(public_link(link))


@link_router.delete("")
async def delete_link(
    program_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)
    link = await session.scalar(select(TrainingLmsLink).where(TrainingLmsLink.program_id == program_id))
    if link is not None:
        await session.delete(link)
        await session.commit()
    return {"ok": True}


@gradebook_router.get("")
async def get_gradebook(
    program_id: uuid.UUID,
    format: str = Query(default="json"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Gradebook rows (overall + per-task scores); TA exports are redacted."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    enrollments = (
        await session.scalars(
            select(TrainingEnrollment).where(TrainingEnrollment.program_id == program_id)
        )
    ).all()
    from app.api.v1.training.deps import display_names

    names = await display_names(session, [e.learner_id for e in enrollments])
    submissions = await load_submissions(session, program_id)
    reviews = await load_reviews(session, submissions)
    members = build_class_progress(
        await load_curriculum(session, program_id),
        [
            {"learner_id": str(e.learner_id), "status": e.status, "display_name": names.get(str(e.learner_id))}
            for e in enrollments
        ],
        [SubmissionLike(s.task_id, str(s.learner_id), s.status, s.updated_at) for s in submissions],
        _review_likes(reviews, submissions),
    )
    rows = []
    for member in members:
        scores = [t.get("score") for t in member["tasks"] if isinstance(t.get("score"), int)]
        rows.append(
            {
                "learnerId": member["learnerId"],
                "displayName": member.get("displayName"),
                "overall": round(sum(scores) / len(scores)) if scores else None,
                "status": member.get("status"),
                "taskScores": {t["taskId"]: t.get("score") for t in member["tasks"]},
            }
        )
    return ok(rows)
