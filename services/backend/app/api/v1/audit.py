"""Consent + hash-chained audit API (``/v1/audit``).

- ``POST /v1/audit`` appends a tamper-evident audit entry to ``audit_ledger``.
- ``GET /v1/audit/{project_id}`` lists a project's chain in chronological order.
- ``GET /v1/audit/{project_id}/verify`` recomputes and checks the chain.
- ``POST /v1/audit/consents`` records an external-AI consent in ``ai_consents_v2``.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.data.common import CamelModel, iso, ok
from app.api.v1.deps import identity_uuid, owned_project
from app.api.v1.training.deps import can_manage, global_role, is_enrolled, load_program
from app.core.audit import compute_chain_hash, verify_chain
from app.core.db import get_session
from app.core.notify import notify_program, notify_project
from app.core.security import Identity, require_identity
from app.models import AiConsent, AuditEntry, Project

router = APIRouter(prefix="/audit", tags=["audit"])

# Must match the `ai_consents_v2_purpose_check` constraint (migration 20260927_0005).
PURPOSES = {"agent_run", "training_submit", "mcp_tool", "export"}


class AuditCreate(CamelModel):
    project_id: uuid.UUID
    action: str = Field(min_length=1, max_length=120)
    actor: str | None = Field(default=None, max_length=120)
    agent_run_id: uuid.UUID | None = None
    prompt_hash: str | None = Field(default=None, max_length=128)
    input_hash: str | None = Field(default=None, max_length=128)
    output_hash: str | None = Field(default=None, max_length=128)
    consent_id: str | None = Field(default=None, max_length=200)


class ConsentCreate(CamelModel):
    # Program-scoped (training_submit) consents may omit the project.
    project_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    training_task_id: str | None = Field(default=None, max_length=200)
    purpose: str = Field(default="agent_run", max_length=32)
    data_categories: list[str] = Field(default_factory=list)
    external_services: list[str] = Field(min_length=1, max_length=10)
    redaction_confirmed: bool = True
    sensitive_scan: dict[str, Any] = Field(default_factory=dict)


def serialize_audit(entry: AuditEntry) -> dict[str, Any]:
    return {
        "id": str(entry.id),
        "projectId": str(entry.project_id),
        "agentRunId": str(entry.agent_run_id) if entry.agent_run_id else None,
        "actor": entry.actor,
        "action": entry.action,
        "promptHash": entry.prompt_hash,
        "inputHash": entry.input_hash,
        "outputHash": entry.output_hash,
        "consentId": entry.consent_id,
        "parentHash": entry.parent_hash,
        "chainHash": entry.chain_hash,
        "timestamp": iso(entry.created_at),
    }


def serialize_consent(consent: AiConsent) -> dict[str, Any]:
    return {
        "id": str(consent.id),
        "projectId": str(consent.project_id) if consent.project_id else None,
        "programId": str(consent.program_id) if consent.program_id else None,
        "trainingTaskId": consent.training_task_id,
        "purpose": consent.purpose,
        "dataCategories": consent.data_categories,
        "externalServices": consent.external_services,
        "redactionConfirmed": consent.redaction_confirmed,
        "sensitiveScan": consent.sensitive_scan,
        "consentedAt": iso(consent.created_at),
    }


async def _latest_entry(session: AsyncSession, project_id: uuid.UUID) -> AuditEntry | None:
    return await session.scalar(
        select(AuditEntry)
        .where(AuditEntry.project_id == project_id)
        .order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc())
        .limit(1)
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def append_audit(
    body: AuditCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Append a hash-chained audit entry for an owned project."""
    owner_id = identity_uuid(identity)
    await owned_project(session, body.project_id, owner_id)
    # Serialize appends per project so concurrent requests cannot fork the
    # chain by reading the same parent_hash.
    await session.execute(select(Project.id).where(Project.id == body.project_id).with_for_update())

    previous = await _latest_entry(session, body.project_id)
    entry = AuditEntry(
        project_id=body.project_id,
        owner_id=owner_id,
        agent_run_id=body.agent_run_id,
        actor=body.actor or identity.user_id,
        action=body.action,
        prompt_hash=body.prompt_hash,
        input_hash=body.input_hash,
        output_hash=body.output_hash,
        consent_id=body.consent_id,
        parent_hash=previous.chain_hash if previous else None,
    )
    session.add(entry)
    await session.flush()  # populate id + created_at before hashing
    entry.chain_hash = compute_chain_hash(entry)
    await notify_project(session, body.project_id, "audit.appended", {"id": str(entry.id), "action": entry.action})
    await session.commit()
    return ok(serialize_audit(entry))


@router.post("/consents", status_code=status.HTTP_201_CREATED)
async def create_consent(
    body: ConsentCreate,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Record an external-AI consent proof in ``ai_consents_v2``."""
    owner_id = identity_uuid(identity)

    if body.purpose not in PURPOSES:
        raise HTTPException(status_code=422, detail="INVALID_CONSENT_PURPOSE")
    if body.purpose == "training_submit":
        if body.program_id is None:
            raise HTTPException(status_code=400, detail="PROGRAM_ID_REQUIRED")
    elif body.project_id is None:
        raise HTTPException(status_code=400, detail="PROJECT_ID_REQUIRED")
    if not body.redaction_confirmed:
        raise HTTPException(status_code=400, detail="REDACTION_NOT_CONFIRMED")

    # Project-scoped consents must reference a project the caller owns.
    if body.project_id is not None:
        await owned_project(session, body.project_id, owner_id)

    # Program-scoped consents require enrollment or program management rights.
    if body.program_id is not None:
        program = await load_program(session, body.program_id)
        role = await global_role(session, owner_id)
        enrolled = await is_enrolled(session, owner_id, program.id)
        manages = await can_manage(session, role, owner_id, program)
        if not (enrolled or manages):
            raise HTTPException(status_code=403, detail="NOT_ENROLLED")

    consent = AiConsent(
        project_id=body.project_id,
        owner_id=owner_id,
        program_id=body.program_id,
        training_task_id=body.training_task_id,
        purpose=body.purpose,
        data_categories=body.data_categories[:20],
        external_services=body.external_services,
        redaction_confirmed=True,
        sensitive_scan=body.sensitive_scan,
    )
    session.add(consent)
    # Project-scoped mutations notify the project stream; camp consents notify the program stream.
    if body.project_id is not None:
        await notify_project(
            session,
            body.project_id,
            "consent.created",
            {"id": str(consent.id), "purpose": consent.purpose},
            program_id=body.program_id,
        )
    elif body.program_id is not None:
        await notify_program(
            session,
            body.program_id,
            "consent.created",
            {"id": str(consent.id), "purpose": consent.purpose},
        )
    await session.commit()
    return ok(serialize_consent(consent))


@router.get("/consents/{consent_id}")
async def get_consent(
    consent_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Return one consent owned by the caller, or 404 (never confirm another user's row)."""
    owner_id = identity_uuid(identity)
    consent = await session.get(AiConsent, consent_id)
    if consent is None or consent.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="CONSENT_NOT_FOUND")
    return ok(serialize_consent(consent))


@router.get("/consents")
async def list_consents(
    project_id: uuid.UUID | None = Query(default=None, alias="projectId"),
    program_id: uuid.UUID | None = Query(default=None, alias="programId"),
    purpose: str | None = None,
    limit: int = Query(default=10, ge=1, le=50),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List the caller's consents for a project or program, newest first."""
    owner_id = identity_uuid(identity)
    if project_id is None and program_id is None:
        raise HTTPException(status_code=400, detail="PROJECT_OR_PROGRAM_REQUIRED")
    if project_id is not None:
        await owned_project(session, project_id, owner_id)
    stmt = select(AiConsent).where(AiConsent.owner_id == owner_id)
    if project_id is not None:
        stmt = stmt.where(AiConsent.project_id == project_id)
    if program_id is not None:
        stmt = stmt.where(AiConsent.program_id == program_id)
    if purpose:
        stmt = stmt.where(AiConsent.purpose == purpose)
    rows = (await session.scalars(stmt.order_by(AiConsent.created_at.desc()).limit(limit))).all()
    return ok([serialize_consent(row) for row in rows])


@router.get("/{project_id}")
async def list_audit(
    project_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """List a project's audit chain in chronological order."""
    owner_id = identity_uuid(identity)
    await owned_project(session, project_id, owner_id)
    rows = (
        await session.scalars(
            select(AuditEntry)
            .where(AuditEntry.project_id == project_id)
            .order_by(AuditEntry.created_at, AuditEntry.id)
        )
    ).all()
    return ok([serialize_audit(row) for row in rows])


@router.get("/{project_id}/verify")
async def verify_audit(
    project_id: uuid.UUID,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Verify the integrity of a project's audit chain."""
    owner_id = identity_uuid(identity)
    await owned_project(session, project_id, owner_id)
    rows = (
        await session.scalars(
            select(AuditEntry)
            .where(AuditEntry.project_id == project_id)
            .order_by(AuditEntry.created_at, AuditEntry.id)
        )
    ).all()
    return ok(verify_chain(rows))
