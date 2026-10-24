"""Durable execution adapter around LangGraph.

Runs are claimed with a lease (token + expiry). The lease fences a stale
worker out of finalizing a run that the reaper re-queued and another worker
re-claimed. Run events commit immediately (see harness.emit) so the SSE
stream stays live during execution.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graphs import allowed_tools_for, build_graph_for
from app.agents.harness import AgentHarness, RunCancelled
from app.core.config import get_settings
from app.core.events import next_run_sequence
from app.mcp.plugin_tools import PluginToolDef, load_user_tools
from app.mcp.pool import discover_remote_tools
from app.models import AgentRun, Artifact, RunEvent, RunStatus
from app.models.domain import now

logger = logging.getLogger(__name__)

_checkpointer_ready = False


def checkpoint_url() -> str:
    # LangGraph's Postgres saver uses psycopg, while application data uses
    # SQLAlchemy/asyncpg.
    return get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")


async def _plugin_tools_for(session: AsyncSession, run: AgentRun) -> dict[str, PluginToolDef]:
    """Resolve the owner-scoped tools declared by the run's plugin (``p.<plugin>.<key>``)."""
    if not run.agent.startswith("p."):
        return {}
    plugin_id = run.agent.split(".", 2)[1]
    try:
        owner_tools = await load_user_tools(session, run.owner_id)
    except Exception:
        return {}
    return {name: tool for name, tool in owner_tools.items() if tool.plugin_id == plugin_id}


async def _finalize_run(session: AsyncSession, run_id: uuid.UUID, lease_token: str | None, **values: Any) -> bool:
    """Conditionally update the run row, only while this worker owns the lease.

    Returns False when the run was reaped and re-claimed meanwhile; callers
    then skip their side effects instead of clobbering the new owner's state.
    """
    statement = update(AgentRun).where(AgentRun.id == run_id, AgentRun.status == RunStatus.RUNNING)
    if lease_token:
        statement = statement.where(AgentRun.lease_token == uuid.UUID(lease_token))
    result = await session.execute(
        statement.values(**values).execution_options(synchronize_session="fetch")
    )
    return bool(result.rowcount)


async def _emit(session: AsyncSession, run_id: uuid.UUID, event_type: str, data: dict[str, Any]) -> None:
    sequence = await next_run_sequence(session, run_id)
    session.add(RunEvent(run_id=run_id, sequence=sequence, type=event_type, data=data))


async def execute_run(
    session: AsyncSession,
    run: AgentRun,
    *,
    lease_token: str | None = None,
    resume: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute or resume one run and reflect its state in product records."""
    settings = get_settings()
    allowed_tools = allowed_tools_for(run.agent)
    plugin_tools = await _plugin_tools_for(session, run)
    allowed_tools |= set(plugin_tools)
    remote_tools: dict[str, Any] = {}
    if settings.mcp_enabled and settings.mcp_server_list:
        try:
            remote_tools = await discover_remote_tools()
        except Exception:
            # Unreachable MCP servers must not break runs that don't need them;
            # calls through the harness would fail as unknown/external errors.
            logger.exception("remote MCP discovery failed; continuing without remote tools")
    harness = AgentHarness(
        session=session,
        run_id=str(run.id),
        allowed_tools=allowed_tools,
        plugin_tools=plugin_tools,
        remote_tools=remote_tools,
        lease_token=lease_token,
        owner_id=str(run.owner_id),
        project_id=str(run.project_id),
        max_tokens=settings.agent_max_tokens_per_run,
    )
    config: RunnableConfig = {"configurable": {"thread_id": str(run.thread_id)}}
    resume = resume if resume is not None else run.resume_input
    try:
        global _checkpointer_ready
        async with AsyncPostgresSaver.from_conn_string(checkpoint_url()) as checkpointer:
            if not _checkpointer_ready:
                await checkpointer.setup()
                _checkpointer_ready = True
            graph = build_graph_for(run.agent, harness).compile(checkpointer=checkpointer)
            if resume is not None:
                value: Any = Command(resume=resume)
            elif run.attempt > 1 and await checkpointer.aget_tuple(config) is not None:
                # Re-claimed after a worker crash: continue from the last
                # checkpoint instead of restarting the graph from scratch.
                value = None
            else:
                value = {
                    "goal": run.goal,
                    "project_id": str(run.project_id),
                    "agent": run.agent,
                    "input": run.input or {},
                    "training_task_id": run.training_task_id,
                    "program_id": str(run.program_id) if run.program_id else None,
                    "mode": run.mode,
                }
            result = await graph.ainvoke(value, config=config)
    except RunCancelled:
        # The lease check makes this a no-op for a stale worker.
        owned = await _finalize_run(
            session, run.id, lease_token, status=RunStatus.CANCELLED, completed_at=now()
        )
        if owned:
            await _emit(session, run.id, "run.cancelled", {})
            await session.commit()
        return {"cancelled": True}

    interrupted = result.get("__interrupt__") if isinstance(result, dict) else None
    if interrupted:
        owned = await _finalize_run(session, run.id, lease_token, status=RunStatus.WAITING_FOR_REVIEW)
        if owned:
            payloads: list[Any] = []
            for item in interrupted:
                value = getattr(item, "value", item)
                payloads.append(value if isinstance(value, dict) else str(value))
            await _emit(session, run.id, "run.interrupted", {"interrupt": payloads})
            await session.commit()
        return {"interrupted": True}

    approval = result.get("approval", {}) if isinstance(result, dict) else {}
    approved = bool(approval.get("approved")) if isinstance(approval, dict) else bool(approval)
    artifact_status = "approved" if approved else "rejected"
    owned = await _finalize_run(
        session,
        run.id,
        lease_token,
        status=RunStatus.SUCCEEDED,
        resume_input=None,
        result=result if isinstance(result, dict) else {"output": str(result)},
        completed_at=now(),
    )
    if owned:
        # Approve/reject every artifact this run produced (single-agent runs
        # have one; workflow runs approve their whole chain).
        await session.execute(
            update(Artifact)
            .where(Artifact.run_id == run.id, Artifact.status == "draft")
            .values(status=artifact_status)
            .execution_options(synchronize_session=False)
        )
        await _emit(
            session, run.id, "run.completed", {"approved": approved, "artifactStatus": artifact_status}
        )
        await session.commit()
    return {"interrupted": False}


async def finalize_run_failed(
    session_factory, run_id: str, lease_token: str | None, error: str
) -> None:
    """Mark a run failed from a fresh session, only while the lease is ours.

    Called by the worker after an unexpected exception; the executing session
    may be in a broken state, so finalization gets its own transaction.
    """
    async with session_factory() as session:
        async with session.begin():
            statement = update(AgentRun).where(
                AgentRun.id == uuid.UUID(run_id), AgentRun.status == RunStatus.RUNNING
            )
            if lease_token:
                statement = statement.where(AgentRun.lease_token == uuid.UUID(lease_token))
            result = await session.execute(
                statement.values(
                    status=RunStatus.FAILED, error=error[:2000], lease_expires_at=None, completed_at=now()
                ).execution_options(synchronize_session="fetch")
            )
            if not result.rowcount:
                return
            await _emit(session, uuid.UUID(run_id), "run.failed", {"error": error[:500]})


async def claim_next_run(session: AsyncSession) -> AgentRun | None:
    """Lease a queued run. SKIP LOCKED allows multiple workers safely.

    The lease token fences writes: a worker whose lease expired and whose run
    was re-claimed can no longer finalize the run (see `_finalize_run`).
    """
    statement = (
        select(AgentRun)
        .where(AgentRun.status == RunStatus.QUEUED, AgentRun.cancel_requested.is_(False))
        .order_by(AgentRun.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    run = await session.scalar(statement)
    if run:
        settings = get_settings()
        run.status = RunStatus.RUNNING
        run.started_at = run.started_at or now()
        run.attempt = (run.attempt or 0) + 1
        run.lease_token = uuid.uuid4()
        run.lease_expires_at = now() + timedelta(seconds=settings.agent_lease_seconds)
    return run


async def reap_stale_runs(session: AsyncSession) -> int:
    """Recover runs whose worker died: requeue, cancel, or fail them.

    Called periodically by the worker loop. Running rows with a missing or
    expired lease are:
    - cancelled when cancellation was requested,
    - failed once they exhausted the attempt budget,
    - re-queued otherwise (a later claim resumes them from their checkpoint).
    """
    settings = get_settings()
    current_time = now()
    expired = (AgentRun.lease_expires_at.is_(None)) | (AgentRun.lease_expires_at < current_time)

    cancelled = (
        await session.scalars(
            update(AgentRun)
            .where(
                AgentRun.status == RunStatus.RUNNING,
                AgentRun.cancel_requested.is_(True),
                expired,
            )
            .values(status=RunStatus.CANCELLED, lease_expires_at=None, completed_at=current_time)
            .returning(AgentRun.id)
        )
    ).all()
    for run_id in cancelled:
        await _emit(session, run_id, "run.cancelled", {"reason": "lease_expired"})
        logger.warning("reaper: cancelled leased-out run %s (cancel requested)", run_id)

    exhausted = (
        await session.scalars(
            update(AgentRun)
            .where(
                AgentRun.status == RunStatus.RUNNING,
                AgentRun.cancel_requested.is_(False),
                AgentRun.attempt >= settings.agent_max_attempts,
                expired,
            )
            .values(
                status=RunStatus.FAILED,
                lease_expires_at=None,
                error="RUN_LEASE_EXPIRED_MAX_ATTEMPTS",
                completed_at=current_time,
            )
            .returning(AgentRun.id)
        )
    ).all()
    for run_id in exhausted:
        await _emit(session, run_id, "run.failed", {"error": "RUN_LEASE_EXPIRED_MAX_ATTEMPTS"})
        logger.error("reaper: failed run %s after %s attempts", run_id, settings.agent_max_attempts)

    requeued = (
        await session.execute(
            update(AgentRun)
            .where(
                AgentRun.status == RunStatus.RUNNING,
                AgentRun.cancel_requested.is_(False),
                AgentRun.attempt < settings.agent_max_attempts,
                expired,
            )
            .values(status=RunStatus.QUEUED, lease_token=None, lease_expires_at=None)
            .returning(AgentRun.id, AgentRun.attempt)
        )
    ).all()
    for run_id, attempt in requeued:
        await _emit(session, run_id, "run.requeued", {"attempt": attempt})
        logger.warning("reaper: re-queued run %s (attempt %s)", run_id, attempt)

    await session.commit()
    return len(cancelled) + len(exhausted) + len(requeued)


def parse_uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value)
