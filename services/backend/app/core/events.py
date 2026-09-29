"""Atomic run-event sequence allocation.

Workers and API handlers append ``RunEvent`` rows concurrently. Computing
``MAX(sequence) + 1`` without serialization lets two writers pick the same
value and trip ``uq_agent_event_sequence``; locking the parent run row first
serializes appends per run.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RunEvent


async def next_run_sequence(session: AsyncSession, run_id: uuid.UUID | str) -> int:
    """Serialize event appends per run and return the next sequence number.

    Uses a transaction-scoped advisory lock rather than a row lock: the worker
    holds its transaction for the whole run, so a row lock would block
    ``cancel_run``'s status update until the run finished.
    """
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:rid, 0))"),
        {"rid": str(run_id)},
    )
    current = await session.scalar(
        select(func.coalesce(func.max(RunEvent.sequence), 0)).where(RunEvent.run_id == run_id)
    )
    return int(current) + 1
