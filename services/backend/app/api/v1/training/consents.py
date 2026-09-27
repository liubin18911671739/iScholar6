"""Camp consent audit (``/v1/training/programs/{id}/consents``)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid
from app.api.v1.training.common import iso, ok
from app.api.v1.training.deps import display_names, global_role, is_program_ta
from app.core.authz import is_global_staff
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import AiConsent

router = APIRouter(prefix="/programs/{program_id}/consents", tags=["training"])


def _mask(user_id: str) -> str:
    return f"{user_id[:8]}…"


@router.get("")
async def list_consents(
    program_id: uuid.UUID,
    purpose: str | None = None,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List camp consent proofs with aggregate stats (staff or program TA)."""
    user_id = identity_uuid(identity)
    role = await global_role(session, user_id)
    staff = is_global_staff(role)
    if not staff and not await is_program_ta(session, user_id, program_id):
        raise HTTPException(status_code=403, detail="FORBIDDEN")

    stmt = select(AiConsent).where(AiConsent.program_id == program_id)
    if purpose:
        stmt = stmt.where(AiConsent.purpose == purpose)
    rows = (await session.scalars(stmt.order_by(AiConsent.created_at.desc()))).all()
    names = await display_names(session, [r.owner_id for r in rows])

    total = len(rows)
    redacted = sum(1 for r in rows if r.redaction_confirmed)
    sensitive_total = sum(int((r.sensitive_scan or {}).get("total", 0)) for r in rows)

    data: list[dict[str, Any]] = [
        {
            "id": str(r.id),
            "userId": str(r.owner_id) if staff else _mask(str(r.owner_id)),
            "displayName": names.get(str(r.owner_id)),
            "projectId": str(r.project_id),
            "programId": str(r.program_id) if r.program_id else None,
            "trainingTaskId": r.training_task_id,
            "purpose": r.purpose,
            "dataCategories": r.data_categories,
            "externalServices": r.external_services,
            "redactionConfirmed": r.redaction_confirmed,
            "sensitiveScan": r.sensitive_scan,
            "consentedAt": iso(r.created_at),
        }
        for r in rows
    ]
    return ok(
        {
            "consents": data,
            "stats": {
                "total": total,
                "redactionConfirmed": redacted,
                "sensitiveScanTotal": sensitive_total,
            },
            "masked": not staff,
        }
    )
