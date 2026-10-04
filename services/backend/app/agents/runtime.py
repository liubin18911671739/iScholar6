"""Durable execution adapter around LangGraph."""

from __future__ import annotations

import uuid
from typing import Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graphs import allowed_tools_for, build_graph_for
from app.agents.harness import AgentHarness, RunCancelled
from app.core.config import get_settings
from app.mcp.plugin_tools import PluginToolDef, load_user_tools
from app.models import AgentRun, Artifact, RunStatus


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


async def execute_run(session: AsyncSession, run: AgentRun, resume: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute or resume one run and reflect its state in product records."""
    allowed_tools = allowed_tools_for(run.agent)
    plugin_tools = await _plugin_tools_for(session, run)
    allowed_tools |= set(plugin_tools)
    harness = AgentHarness(
        session=session, run_id=str(run.id), allowed_tools=allowed_tools, plugin_tools=plugin_tools
    )
    config = {"configurable": {"thread_id": str(run.thread_id)}}
    resume = resume if resume is not None else run.resume_input
    try:
      async with AsyncPostgresSaver.from_conn_string(checkpoint_url()) as checkpointer:
        await checkpointer.setup()
        graph = build_graph_for(run.agent, harness).compile(checkpointer=checkpointer)
        value: Any = Command(resume=resume) if resume is not None else {
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
        run.status = RunStatus.CANCELLED
        await harness.emit("run.cancelled", {})
        return {"cancelled": True}

    interrupted = result.get("__interrupt__") if isinstance(result, dict) else None
    if interrupted:
        run.status = RunStatus.WAITING_FOR_REVIEW
        await harness.emit("run.interrupted", {"interrupt": [str(item) for item in interrupted]})
        return {"interrupted": True}

    approval = result.get("approval", {}) if isinstance(result, dict) else {}
    approved = bool(approval.get("approved")) if isinstance(approval, dict) else bool(approval)
    artifact = await session.scalar(select(Artifact).where(Artifact.run_id == run.id).order_by(Artifact.created_at.desc()))
    if artifact:
        artifact.status = "approved" if approved else "rejected"
    run.status = RunStatus.SUCCEEDED
    run.resume_input = None
    run.result = result if isinstance(result, dict) else {"output": str(result)}
    await harness.emit("run.completed", {"approved": approved, "artifactId": str(artifact.id) if artifact else None})
    return {"interrupted": False}


async def claim_next_run(session: AsyncSession) -> AgentRun | None:
    """Lease a queued run. SKIP LOCKED allows multiple workers safely."""
    statement = (
        select(AgentRun)
        .where(AgentRun.status == RunStatus.QUEUED, AgentRun.cancel_requested.is_(False))
        .order_by(AgentRun.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    run = await session.scalar(statement)
    if run:
        run.status = RunStatus.RUNNING
        from app.models.domain import now

        run.started_at = now()
    return run


def parse_uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value)
