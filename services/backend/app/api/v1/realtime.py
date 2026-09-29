"""Realtime SSE bridge backed by Postgres ``LISTEN``/``NOTIFY``.

- ``GET /v1/realtime/projects/{project_id}`` streams project-scoped mutations
  to the project owner.
- ``GET /v1/realtime/training?programIds=a,b`` streams camp submission/review
  metadata to global staff or the program's TA.

Both endpoints LISTEN on the shared ``ischolar_events`` channel with a raw
asyncpg connection and filter the JSON payload. The HTTP request's regular
SQLAlchemy session is only used for the up-front ownership/role check.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import identity_uuid, owned_project
from app.api.v1.training.deps import global_role, is_program_ta
from app.core.authz import is_global_staff
from app.core.config import get_settings
from app.core.db import get_session
from app.core.notify import CHANNEL
from app.core.security import Identity, require_identity

router = APIRouter(prefix="/realtime", tags=["realtime"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _listen_dsn() -> str:
    """Convert the SQLAlchemy async DSN into an asyncpg connection string."""
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")


async def _event_stream(
    request: Request, matcher: Callable[[dict[str, Any]], bool]
) -> AsyncIterator[str]:
    """Yield SSE frames for committed events that satisfy ``matcher``."""
    connection = await asyncpg.connect(_listen_dsn())
    queue: asyncio.Queue[str] = asyncio.Queue()

    def _listener(_conn: object, _pid: int, _channel: str, payload: str) -> None:
        queue.put_nowait(payload)

    try:
        await connection.add_listener(CHANNEL, _listener)
        yield "event: ready\ndata: {}\n\n"
        while not await request.is_disconnected():
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield ": keepalive\n\n"
                continue
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if not matcher(parsed):
                continue
            kind = parsed.get("kind", "update")
            data = parsed.get("data") or {}
            yield f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    finally:
        try:
            await connection.remove_listener(CHANNEL, _listener)
        finally:
            await connection.close()


@router.get("/projects/{project_id}")
async def project_events(
    project_id: uuid.UUID,
    request: Request,
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Stream realtime events for an owned project."""
    owner_id = identity_uuid(identity)
    await owned_project(session, project_id, owner_id)
    wanted = str(project_id)

    def match(payload: dict[str, Any]) -> bool:
        return payload.get("projectId") == wanted

    return StreamingResponse(
        _event_stream(request, match), media_type="text/event-stream", headers=_SSE_HEADERS
    )


@router.get("/training")
async def training_events(
    request: Request,
    program_ids: str = Query(alias="programIds"),
    identity: Identity = Depends(require_identity),
    session: AsyncSession = Depends(get_session),
):
    """Stream camp submission/review events for programs the caller can review."""
    user_id = identity_uuid(identity)
    wanted = {part.strip() for part in program_ids.split(",") if part.strip()}
    if not wanted:
        raise HTTPException(status_code=422, detail="PROGRAM_IDS_REQUIRED")
    role = await global_role(session, user_id)
    if not is_global_staff(role):
        for raw in wanted:
            try:
                program_uuid = uuid.UUID(raw)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="INVALID_PROGRAM_ID") from exc
            if not await is_program_ta(session, user_id, program_uuid):
                raise HTTPException(status_code=403, detail="FORBIDDEN")

    def match(payload: dict[str, Any]) -> bool:
        return payload.get("programId") in wanted

    return StreamingResponse(
        _event_stream(request, match), media_type="text/event-stream", headers=_SSE_HEADERS
    )
