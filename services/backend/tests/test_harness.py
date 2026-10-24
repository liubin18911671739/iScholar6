"""Harness policy unit tests: budgets, allow-list, identity binding, idempotency.

DB-backed tests (budget/event counters, artifact/evidence idempotency) skip
automatically when Postgres is unavailable.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.harness import AgentHarness, HarnessError
from app.mcp.pool import RemoteMCPTool, validate_server_url
from app.models import AgentRun, AgentThread, Artifact, Evidence, Project, RunEvent, RunStatus

# ---------------------------------------------------------------------------
# Offline: allow-list / budget / routing semantics


class _FakeParams:
    def __init__(self, scalar_value: int) -> None:
        self.scalar_value = scalar_value

    def scalars(self):
        return self

    def first(self):
        return (RunStatus.RUNNING, False, None)

    def scalar(self):
        return self.scalar_value


class _FakeSession:
    """Counts fake tool.started events for budget checks."""

    def __init__(self, started: int = 0) -> None:
        self.started_rows = started
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def execute(self, statement, params=None):
        del statement
        return _FakeParams(self.started_rows)

    async def scalar(self, statement):
        del statement
        return self.started_rows

    def add(self, obj):
        del obj

    async def commit(self):
        return None

    async def flush(self):
        return None


async def _noop(self) -> None:  # noqa: ARG001 - replaces ensure_active
    return None


def _remote_tool() -> RemoteMCPTool:
    return RemoteMCPTool(
        name="mcp.server.tool",
        raw_name="tool",
        description="d",
        server_name="server",
        server_url="https://s.example/x",
    )


def test_call_tool_rejects_not_allowed() -> None:
    harness = AgentHarness(session=_FakeSession(), run_id="r", allowed_tools=set())  # type: ignore[arg-type]
    with pytest.raises(HarnessError, match="TOOL_NOT_ALLOWED"):
        import asyncio

        asyncio.run(harness.call_tool("scholar.search", query="x"))


def test_tool_budget_counts_attempts_not_successes() -> None:
    harness = AgentHarness(
        session=_FakeSession(started=1), run_id="r", allowed_tools={"scholar.search"}, max_tool_calls=1
    )  # type: ignore[arg-type]
    with pytest.raises(HarnessError, match="TOOL_BUDGET_EXCEEDED"):
        import asyncio

        asyncio.run(harness.call_tool("scholar.search", query="x"))


def test_token_budget_accumulates() -> None:
    harness = AgentHarness(session=_FakeSession(), run_id="r", allowed_tools=set(), max_tokens=100)  # type: ignore[arg-type]
    harness.record_usage(60, 60)
    assert harness.token_in == 60 and harness.token_out == 60
    import asyncio

    async def _check():
        await harness.check_model_budget()

    with pytest.raises(HarnessError, match="MODEL_BUDGET_EXCEEDED"):
        asyncio.run(_check())


@pytest.mark.asyncio
async def test_remote_tool_routes_by_namespaced_name(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def fake_remote(tool: RemoteMCPTool, arguments: dict[str, Any]) -> Any:
        calls.append((tool.raw_name, arguments))
        return [{"id": 1}]

    monkeypatch.setattr("app.agents.harness.call_remote_tool", fake_remote)
    monkeypatch.setattr(AgentHarness, "ensure_active", _noop)
    remote = {"mcp.server.tool": _remote_tool()}
    harness = AgentHarness(
        session=_FakeSession(), run_id="r", allowed_tools={"mcp.server.tool"}, remote_tools=remote  # type: ignore[arg-type]
    )
    result = await harness.call_tool("mcp.server.tool", q="x")
    assert result == [{"id": 1}]
    assert calls == [("tool", {"q": "x"})]


@pytest.mark.asyncio
async def test_remote_tool_requires_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(AgentHarness, "ensure_active", _noop)
    harness = AgentHarness(session=_FakeSession(), run_id="r", allowed_tools=set(), remote_tools={"mcp.server.tool": _remote_tool()})  # type: ignore[arg-type]
    with pytest.raises(HarnessError, match="TOOL_NOT_ALLOWED"):
        await harness.call_tool("mcp.server.tool")


def test_validate_server_url_rules() -> None:
    assert validate_server_url("https://mcp.example.com/mcp")
    assert validate_server_url("http://mcp.internal/mcp")  # dev allows plain http
    with pytest.raises(ValueError):
        validate_server_url("https://user:pass@mcp.example.com")
    with pytest.raises(ValueError):
        validate_server_url("ftp://mcp.example.com")


# ---------------------------------------------------------------------------
# DB-backed: identity binding, artifact/evidence idempotency


async def _seed_run(db_session: AsyncSession, owner: uuid.UUID, agent: str = "write"):
    project = Project(owner_id=owner, name=f"p-{uuid.uuid4().hex[:8]}")
    db_session.add(project)
    await db_session.flush()
    thread = AgentThread(project_id=project.id, owner_id=owner)
    db_session.add(thread)
    await db_session.flush()
    run = AgentRun(thread_id=thread.id, project_id=project.id, owner_id=owner, agent=agent, goal="g", status="running")
    db_session.add(run)
    await db_session.commit()
    return project, run


@pytest.mark.asyncio
async def test_ischolar_identity_is_bound_to_execution_context(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A model-supplied foreign owner id is stripped; the run owner is enforced."""
    owner = uuid.uuid4()
    other = uuid.uuid4()
    project, run = await _seed_run(db_session, owner)

    monkeypatch.setattr("app.mcp.tools.ischolar.SessionLocal", lambda: _SessionCtx(db_session))

    harness = AgentHarness(
        session=db_session,
        run_id=str(run.id),
        allowed_tools={"ischolar.list_projects"},
        owner_id=str(owner),
    )
    results = await harness.call_tool("ischolar.list_projects", owner_id=str(other))
    listed = [row["id"] for row in results]
    # The foreign owner_id is stripped; the execution owner's project is listed.
    assert listed == [str(project.id)]

    project_other = Project(owner_id=other, name="theirs")
    db_session.add(project_other)
    await db_session.commit()
    results = await harness.call_tool("ischolar.list_projects", owner_id=str(other))
    listed = [row["id"] for row in results]
    assert str(project.id) in listed
    assert str(project_other.id) not in listed


@pytest.mark.asyncio
async def test_save_draft_is_idempotent(db_session: AsyncSession) -> None:
    project, run = await _seed_run(db_session, uuid.uuid4())

    harness = AgentHarness(session=db_session, run_id=str(run.id), allowed_tools=set())
    content = {"text": "same"}
    first = await harness.save_draft(str(project.id), "manuscript_draft", content)
    second = await harness.save_draft(str(project.id), "manuscript_draft", content)
    assert str(first.id) == str(second.id)
    count = await db_session.scalar(select(func.count()).select_from(Artifact).where(Artifact.run_id == run.id))
    assert count == 1


@pytest.mark.asyncio
async def test_save_draft_reuses_logical_step_artifact_on_changed_retry(db_session: AsyncSession) -> None:
    project, run = await _seed_run(db_session, uuid.uuid4())
    harness = AgentHarness(session=db_session, run_id=str(run.id), allowed_tools=set())
    first = await harness.save_draft(
        str(project.id), "topic_proposal", {"text": "attempt one"}, logical_key="research-plan:topic"
    )
    second = await harness.save_draft(
        str(project.id), "topic_proposal", {"text": "attempt two"}, logical_key="research-plan:topic"
    )
    assert first.id == second.id
    assert second.content == {"text": "attempt two"}
    count = await db_session.scalar(select(func.count()).select_from(Artifact).where(Artifact.run_id == run.id))
    assert count == 1
    update_events = (await db_session.scalars(
        select(RunEvent).where(RunEvent.run_id == run.id, RunEvent.type == "artifact.draft_updated")
    )).all()
    assert len(update_events) == 1
    assert update_events[0].data["logicalKey"] == "research-plan:topic"


@pytest.mark.asyncio
async def test_persist_evidence_deduplicates_by_url(db_session: AsyncSession) -> None:
    project, run = await _seed_run(db_session, uuid.uuid4(), agent="litreview")

    harness = AgentHarness(session=db_session, run_id=str(run.id), allowed_tools=set())
    items = [{"title": "Paper", "url": "https://example.org/p", "doi": "10.1/p"}]
    await harness.persist_evidence(items)
    await harness.persist_evidence(items)  # crash-replay duplicate
    count = await db_session.scalar(select(func.count()).select_from(Evidence).where(Evidence.run_id == run.id))
    assert count == 1


class _SessionCtx:
    """Test double for tool modules' SessionLocal: reuse the test session."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def __call__(self):
        return self

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *args):
        return None
