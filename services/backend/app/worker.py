"""Database-backed worker for durable agent runs.

Run as a separate compose service: ``python -m app.worker``.
"""

from __future__ import annotations

import asyncio
import logging

from app.agents.runtime import claim_next_run, execute_run
from app.core.db import SessionLocal
from app.models import RunStatus
from app.models.domain import now

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def work_once() -> bool:
    async with SessionLocal() as session:
        async with session.begin():
            run = await claim_next_run(session)
            if not run:
                return False
            run_id = str(run.id)
        try:
            async with session.begin():
                await execute_run(session, run)
        except Exception as exc:  # Errors are durable product state, not lost logs.
            logger.exception("agent run failed: %s", run_id)
            async with session.begin():
                run.status = RunStatus.FAILED
                run.error = str(exc)
                run.completed_at = now()
        else:
            async with session.begin():
                if run.status in {RunStatus.SUCCEEDED, RunStatus.CANCELLED}:
                    run.completed_at = now()
        return True


async def main() -> None:
    while True:
        worked = await work_once()
        await asyncio.sleep(0.25 if worked else 1.0)


if __name__ == "__main__":
    asyncio.run(main())
