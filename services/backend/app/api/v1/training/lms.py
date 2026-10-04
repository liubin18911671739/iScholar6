"""Per-program LMS/LTI link, gradebook, and AGS score push
(``/v1/training/programs/{id}/lms/*``).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import CamelModel, iso, ok
from app.api.v1.training.deps import (
    can_manage,
    global_role,
    load_program,
    require_manage,
    require_staff_or_ta,
    user_contacts,
)
from app.api.v1.training.progress import _review_likes, load_curriculum, load_reviews, load_submissions
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import TrainingEnrollment, TrainingLmsLink
from app.training.export import to_csv
from app.training.lms_ags import LmsLinkCredentials, push_gradebook_to_ags
from app.training.lms_gradebook import build_lms_gradebook_rows, to_ags_score_lines
from app.training.progress import SubmissionLike, build_class_progress

link_router = APIRouter(prefix="/programs/{program_id}/lms/link", tags=["training"])
gradebook_router = APIRouter(prefix="/programs/{program_id}/lms/gradebook", tags=["training"])
push_router = APIRouter(prefix="/programs/{program_id}/lms/push", tags=["training"])


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


async def _gradebook_learners(session: AsyncSession, program_id: uuid.UUID) -> list[dict[str, Any]]:
    """Build per-learner gradebook rows (overall + per-task scores)."""
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
    return rows


@gradebook_router.get("")
async def get_gradebook(
    program_id: uuid.UUID,
    format: str = Query(default="generic"),
    as_: str | None = Query(default=None, alias="as"),
    email: bool = Query(default=False),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """LMS gradebook CSV (Canvas/Moodle/generic) or an AGS-shaped JSON payload.

    Staff or the program TA; TA exports never include emails.
    """
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    staff = await can_manage(session, role, user_id, program)
    if not staff:
        await require_staff_or_ta(session, role, user_id, program)

    learners = await _gradebook_learners(session, program_id)
    if email and staff:
        contacts = await user_contacts(session, [uuid.UUID(learner["learnerId"]) for learner in learners])
        for learner in learners:
            learner["email"] = (contacts.get(learner["learnerId"]) or {}).get("email")

    if as_ == "ags":
        line_item = f"urn:ischolar:program:{program_id}:overall"
        return {
            "ok": True,
            "program": {"id": str(program.id), "name": program.name},
            "format": "ags",
            "lineItem": {"id": line_item, "label": f"{program.name} Overall", "scoreMaximum": 100},
            "scores": to_ags_score_lines(learners, line_item),
            "note": "LTI Advantage AGS-shaped payload for manual/integration wiring. No OAuth in this endpoint.",
        }

    if format not in {"generic", "canvas", "moodle"}:
        raise HTTPException(status_code=422, detail="INVALID_FORMAT")
    rows = build_lms_gradebook_rows(learners, format, course_name=program.name)
    safe_name = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", program.name)
    stamp = datetime.now(UTC).date().isoformat()
    filename = f"lms-{format}-{safe_name}-{stamp}.csv"
    return Response(
        content=to_csv(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class LmsPushRequest(CamelModel):
    dry_run: bool = False
    user_id_map: dict[str, str] | None = None


@push_router.post("")
async def push_grades(
    program_id: uuid.UUID,
    body: LmsPushRequest,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Push AGS scores to the linked LMS line item, persisting the outcome.

    The response `data.ok`/`data.failed` report the push outcome; a per-user
    failure list is returned in `data.errors` (mirrors the legacy route).
    """
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    program = await load_program(session, program_id)
    await require_manage(session, role, user_id, program)

    link = await session.scalar(select(TrainingLmsLink).where(TrainingLmsLink.program_id == program_id))
    if link is None or not link.enabled:
        raise HTTPException(status_code=400, detail="LMS_LINK_DISABLED")
    if not link.client_id or not link.token_url or not link.ags_lineitem_url:
        raise HTTPException(status_code=400, detail="LMS_CONFIG_INCOMPLETE")

    credentials = LmsLinkCredentials(
        platform=link.platform or "generic",
        client_id=link.client_id,
        client_secret=link.client_secret,
        token_url=link.token_url,
        ags_lineitem_url=link.ags_lineitem_url,
        auth_method=link.auth_method or "client_secret_post",
        private_key_pem=link.private_key_pem,
        issuer=link.issuer,
    )
    result = await push_gradebook_to_ags(
        credentials=credentials,
        learners=await _gradebook_learners(session, program_id),
        user_id_map=body.user_id_map,
        dry_run=body.dry_run,
    )

    link.last_push_at = datetime.now(UTC)
    link.last_push_status = ("dry_run_ok" if body.dry_run else "ok") if result["ok"] else "error"
    link.last_push_error = (
        None
        if result["ok"]
        else "; ".join(f"{e['userId']}:{e['error']}" for e in result["errors"])[:1000]
    )
    await session.commit()
    return ok({**result, "dryRun": body.dry_run})
