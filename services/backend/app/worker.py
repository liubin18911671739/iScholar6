"""Database-backed worker for durable agent runs.

Run as a separate compose service: ``python -m app.worker``.

Reliability model:
- Claims use a lease (token + expiry) so multiple workers are safe.
- A heartbeat extends the lease while the run executes.
- A reaper re-queues runs whose worker died (or cancels/fails them).
- Finalization is conditional on the lease token, so a stale worker cannot
  clobber a run that was re-claimed by another worker.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid
from datetime import timedelta

from sqlalchemy import update

from app.agents.harness import RunCancelled, RunStale
from app.agents.runtime import claim_next_run, execute_run, reap_stale_runs
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import AgentRun, RunStatus
from app.models.domain import now

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _heartbeat_loop(
    factory, run_id: uuid.UUID, lease_token: str, interval_seconds: int, stop: asyncio.Event
) -> None:
    """Extend the run lease until the run finishes or the lease is lost."""
    while not stop.is_set():
        try:
            async with factory() as session:
                async with session.begin():
                    result = await session.execute(
                        update(AgentRun)
                        .where(
                            AgentRun.id == run_id,
                            AgentRun.lease_token == uuid.UUID(lease_token),
                            AgentRun.status == RunStatus.RUNNING,
                        )
                        .values(
                            lease_expires_at=now() + timedelta(seconds=get_settings().agent_lease_seconds)
                        )
                    )
                    if result.rowcount == 0:
                        logger.warning("heartbeat: lost lease for run %s", run_id)
                        return
        except Exception:  # pragma: no cover - transient DB errors
            logger.exception("heartbeat: failed for run %s", run_id)
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval_seconds)


async def _finalize_failed(factory, run_id: str, lease_token: str | None, error: str) -> None:
    """Delegate failure finalization to the runtime (lease-fenced, own tx)."""
    from app.agents.runtime import finalize_run_failed

    await finalize_run_failed(factory, run_id, lease_token, error)


async def work_once(
    *, session_factory=SessionLocal, heartbeat: bool = True
) -> bool:
    """Claim and execute at most one run. Returns True when a run was processed."""
    settings = get_settings()
    async with session_factory() as session:
        async with session.begin():
            run = await claim_next_run(session)
            if not run:
                return False
            run_id = str(run.id)
            lease_token = str(run.lease_token) if run.lease_token else None

        heartbeat_task: asyncio.Task | None = None
        stop = asyncio.Event()
        if heartbeat and lease_token:
            heartbeat_task = asyncio.create_task(
                _heartbeat_loop(
                    session_factory, uuid.UUID(run_id), lease_token, settings.agent_heartbeat_seconds, stop
                )
            )
        try:
            await execute_run(session, run, lease_token=lease_token)
        except RunStale:
            logger.warning("run %s lost its lease; aborting this attempt", run_id)
        except RunCancelled:
            pass  # Finalize + events already handled inside execute_run.
        except Exception as exc:  # Errors are durable product state, not lost logs.
            logger.exception("agent run failed: %s", run_id)
            await _finalize_failed(session_factory, run_id, lease_token, str(exc))
        finally:
            if heartbeat_task is not None:
                stop.set()
                heartbeat_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await heartbeat_task
    return True


async def main() -> None:
    settings = get_settings()
    last_reap = 0.0
    reap_interval = settings.agent_reap_interval_seconds
    while True:
        worked = await work_once()
        if time.monotonic() - last_reap >= reap_interval:
            try:
                async with SessionLocal() as session:
                    await reap_stale_runs(session)
            except Exception:  # pragma: no cover - keep the loop alive
                logger.exception("reaper scan failed")
            last_reap = time.monotonic()
        await asyncio.sleep(0.25 if worked else 1.0)


if __name__ == "__main__":
    asyncio.run(main())
