"""Public durable-agent API and event stream."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.runtime import execute_run
from app.core.db import get_session
from app.core.security import Identity, require_identity
from app.models import AiConsent, AgentRun, AgentThread, Artifact, Project, RunEvent, RunStatus
from app.models.domain import now

router = APIRouter(prefix="/agent", tags=["agent"])


class ThreadCreate(BaseModel):
    project_id: uuid.UUID
    title: str | None = Field(default=None, max_length=240)


class RunCreate(BaseModel):
    thread_id: uuid.UUID
    goal: str = Field(min_length=3, max_length=20_000)
    agent: str = Field(default="orchestrator", pattern=r"^(orchestrator|topic|litreview|design|data|write|submit|rebuttal|hermes)$")
    input: dict[str, Any] = Field(default_factory=dict)
    consent_id: uuid.UUID | None = None


class ResumeBody(BaseModel):
    approved: bool | None = None
    input: dict[str, Any] = Field(default_factory=dict)


def identity_uuid(identity: Identity) -> uuid.UUID:
    try:
        return uuid.UUID(identity.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="INVALID_SERVICE_USER") from exc


async def owned_project(session: AsyncSession, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project:
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.owner_id == owner_id))
    if not project:
        raise HTTPException(status_code=404, detail="PROJECT_NOT_FOUND")
    return project


async def owned_run(session: AsyncSession, run_id: uuid.UUID, owner_id: uuid.UUID) -> AgentRun:
    run = await session.scalar(select(AgentRun).where(AgentRun.id == run_id, AgentRun.owner_id == owner_id))
    if not run:
        raise HTTPException(status_code=404, detail="RUN_NOT_FOUND")
    return run


def serialize_run(run: AgentRun, artifacts: list[Artifact] | None = None) -> dict[str, Any]:
    return {
        "id": str(run.id), "threadId": str(run.thread_id), "projectId": str(run.project_id), "agent": run.agent,
        "goal": run.goal, "status": run.status, "result": run.result, "error": run.error,
        "cancelRequested": run.cancel_requested, "createdAt": run.created_at.isoformat(),
        "startedAt": run.started_at.isoformat() if run.started_at else None,
        "completedAt": run.completed_at.isoformat() if run.completed_at else None,
        "artifacts": [{"id": str(a.id), "kind": a.kind, "status": a.status, "content": a.content} for a in artifacts or []],
    }


@router.post("/threads", status_code=status.HTTP_201_CREATED)
async def create_thread(body: ThreadCreate, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    owner_id = identity_uuid(identity)
    await owned_project(session, body.project_id, owner_id)
    thread = AgentThread(project_id=body.project_id, owner_id=owner_id, title=body.title)
    session.add(thread)
    await session.commit()
    return {"ok": True, "data": {"id": str(thread.id), "projectId": str(thread.project_id), "title": thread.title}}


@router.post("/runs", status_code=status.HTTP_202_ACCEPTED)
async def create_run(
    body: RunCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session),
):
    owner_id = identity_uuid(identity)
    thread = await session.scalar(select(AgentThread).where(AgentThread.id == body.thread_id, AgentThread.owner_id == owner_id))
    if not thread:
        raise HTTPException(status_code=404, detail="THREAD_NOT_FOUND")
    if idempotency_key:
        existing = await session.scalar(select(AgentRun).where(AgentRun.idempotency_key == idempotency_key, AgentRun.owner_id == owner_id))
        if existing:
            return {"ok": True, "data": serialize_run(existing)}
    consent = await session.scalar(select(AiConsent).where(AiConsent.id == body.consent_id, AiConsent.project_id == thread.project_id, AiConsent.owner_id == owner_id, AiConsent.redaction_confirmed.is_(True))) if body.consent_id else None
    if not consent or "crossref" not in {service.lower() for service in consent.external_services}:
        raise HTTPException(status_code=403, detail="EXTERNAL_AI_CONSENT_REQUIRED")
    run = AgentRun(thread_id=thread.id, project_id=thread.project_id, owner_id=owner_id, goal=body.goal, agent=body.agent, input=body.input, consent_id=body.consent_id, idempotency_key=idempotency_key)
    session.add(run)
    await session.flush()
    session.add(RunEvent(run_id=run.id, sequence=1, type="run.queued", data={"goal": body.goal, "agent": body.agent}))
    await session.commit()
    return {"ok": True, "data": serialize_run(run)}


@router.get("/runs/{run_id}")
async def get_run(run_id: uuid.UUID, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    run = await owned_run(session, run_id, identity_uuid(identity))
    artifacts = (await session.scalars(select(Artifact).where(Artifact.run_id == run.id).order_by(Artifact.created_at))).all()
    return {"ok": True, "data": serialize_run(run, list(artifacts))}


@router.post("/runs/{run_id}/resume", status_code=status.HTTP_202_ACCEPTED)
async def resume_run(run_id: uuid.UUID, body: ResumeBody, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    run = await owned_run(session, run_id, identity_uuid(identity))
    if run.status not in {RunStatus.WAITING_FOR_INPUT, RunStatus.WAITING_FOR_REVIEW}:
        raise HTTPException(status_code=409, detail="RUN_NOT_WAITING")
    run.status = RunStatus.QUEUED
    run.resume_input = {"approved": body.approved, **body.input}
    sequence = (await session.scalar(select(func.coalesce(func.max(RunEvent.sequence), 0)).where(RunEvent.run_id == run.id))) + 1
    session.add(RunEvent(run_id=run.id, sequence=sequence, type="run.resumed", data=body.model_dump()))
    await session.commit()
    return {"ok": True, "data": serialize_run(run)}


@router.post("/runs/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(run_id: uuid.UUID, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    run = await owned_run(session, run_id, identity_uuid(identity))
    if run.status in {RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED}:
        raise HTTPException(status_code=409, detail="RUN_ALREADY_FINISHED")
    run.cancel_requested = True
    if run.status == RunStatus.QUEUED:
        run.status = RunStatus.CANCELLED
        run.completed_at = now()
    await session.commit()
    return {"ok": True, "data": serialize_run(run)}


@router.get("/runs/{run_id}/events")
async def run_events(run_id: uuid.UUID, request: Request, after: int = 0, identity: Identity = Depends(require_identity), session: AsyncSession = Depends(get_session)):
    run = await owned_run(session, run_id, identity_uuid(identity))

    async def stream():
        cursor = after
        while not await request.is_disconnected():
            events = (await session.scalars(select(RunEvent).where(RunEvent.run_id == run.id, RunEvent.sequence > cursor).order_by(RunEvent.sequence))).all()
            for event in events:
                cursor = event.sequence
                yield f"id: {event.sequence}\nevent: {event.type}\ndata: {json.dumps(event.data)}\n\n"
            current = await session.scalar(select(AgentRun.status).where(AgentRun.id == run.id))
            if current in {RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED}:
                yield f"event: end\ndata: {json.dumps({'status': current})}\n\n"
                return
            yield ": keepalive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
