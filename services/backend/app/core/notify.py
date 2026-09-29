"""Postgres ``NOTIFY`` helpers for the realtime SSE bridge.

Writes call ``notify_project`` / ``notify_program`` *inside* the same
transaction as the mutation, so subscribers only observe committed state. The
payload is JSON encoded and capped below PostgreSQL's ~8000-byte NOTIFY limit.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CHANNEL = "ischolar_events"
_MAX_PAYLOAD = 7900


def event_payload(
    kind: str,
    data: dict[str, Any] | None = None,
    *,
    project_id: uuid.UUID | str | None = None,
    program_id: uuid.UUID | str | None = None,
) -> str:
    """Build the JSON NOTIFY payload for one realtime event."""
    body: dict[str, Any] = {"kind": kind, "data": data or {}}
    if project_id is not None:
        body["projectId"] = str(project_id)
    if program_id is not None:
        body["programId"] = str(program_id)
    encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) <= _MAX_PAYLOAD:
        return encoded
    # Oversized: never slice (which truncates mid-JSON / can exceed the byte
    # limit for multibyte text). Drop the payload to a valid compact marker.
    body["data"] = {"kind": kind, "truncated": True}
    encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) <= _MAX_PAYLOAD:
        return encoded
    body.pop("data", None)
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


async def notify_event(
    session: AsyncSession,
    kind: str,
    data: dict[str, Any] | None = None,
    *,
    project_id: uuid.UUID | str | None = None,
    program_id: uuid.UUID | str | None = None,
) -> None:
    """Emit a realtime event on the shared channel within the current transaction."""
    payload = event_payload(kind, data, project_id=project_id, program_id=program_id)
    await session.execute(
        text("SELECT pg_notify(:channel, :payload)"),
        {"channel": CHANNEL, "payload": payload},
    )


async def notify_project(
    session: AsyncSession,
    project_id: uuid.UUID | str,
    kind: str,
    data: dict[str, Any] | None = None,
    *,
    program_id: uuid.UUID | str | None = None,
) -> None:
    """Emit a project-scoped realtime event."""
    await notify_event(session, kind, data, project_id=project_id, program_id=program_id)


async def notify_program(
    session: AsyncSession,
    program_id: uuid.UUID | str,
    kind: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Emit a program-scoped realtime event (training ops console)."""
    await notify_event(session, kind, data, program_id=program_id)
