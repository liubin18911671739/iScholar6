"""research-plan workflow: gate/resume lifecycle, revisions, abort (PG-backed)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.agents.model as model_module
import app.mcp.registry as registry_module
from app.agents.graphs.research_plan import _workflow_language
from app.agents.runtime import claim_next_run, execute_run
from app.core.config import Settings
from app.models import AgentRun, Artifact, Evidence, RunEvent, RunStatus

# Deterministic tool result served by the stubbed registry.
_TOOL_RESULT = [{"title": "Deterministic Paper", "url": "https://example.org/paper", "doi": "10.1/x"}]


def test_workflow_language_resolves_auto_from_input_text() -> None:
    assert _workflow_language({"language": "auto", "researchGoal": "研究人工智能辅助学习"}) == "zh"
    assert _workflow_language({"language": "auto", "researchGoal": "Study AI supported learning"}) == "en"
    assert _workflow_language({"language": "en", "researchGoal": "中文输入"}) == "en"


def _fake_model_patch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.agents.model.get_settings",
        lambda: Settings(agent_model_fake=True, deepseek_api_key=None),
    )


async def _seed_run(db_session: AsyncSession, agent: str = "research-plan"):
    from app.models import AgentThread, Project

    owner = uuid.uuid4()
    project = Project(owner_id=owner, name=f"workflow-{uuid.uuid4().hex[:8]}")
    db_session.add(project)
    await db_session.flush()
    thread = AgentThread(project_id=project.id, owner_id=owner)
    db_session.add(thread)
    await db_session.flush()
    run = AgentRun(
        thread_id=thread.id, project_id=project.id, owner_id=owner, agent=agent, goal="plan a study", status=RunStatus.QUEUED
    )
    db_session.add(run)
    await db_session.commit()
    return run


async def _drive(db_session: AsyncSession, run: AgentRun, resume: dict | None = None):
    """Worker cycle: claim (fresh lease) → execute → commit."""
    if resume is not None:
        run.status = RunStatus.QUEUED
        run.resume_input = resume
        await db_session.commit()
    claimed = await claim_next_run(db_session)
    await db_session.commit()
    assert claimed is not None and claimed.id == run.id
    outcome = await execute_run(db_session, claimed)
    await db_session.commit()
    return outcome


@pytest.mark.asyncio
async def test_workflow_full_path_two_gates(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_model_patch(monkeypatch)
    monkeypatch.setattr(registry_module.registry, "call", _stub_registry_call)

    run = await _seed_run(db_session)

    # First gate: topic proposal.
    first = await _drive(db_session, run)
    assert first == {"interrupted": True}
    await db_session.refresh(run)
    assert run.status == RunStatus.WAITING_FOR_REVIEW

    # Approve with an explicit topic selection → workflow continues…
    second = await _drive(db_session, run, resume={"approved": True, "selected": "Candidate 1"})
    # …until the final gate.
    assert second == {"interrupted": True}
    assert run.status == RunStatus.WAITING_FOR_REVIEW

    # Final approval → all artifacts approved, run succeeded.
    third = await _drive(db_session, run, resume={"approved": True})
    assert third == {"interrupted": False}
    await db_session.refresh(run)
    assert run.status == RunStatus.SUCCEEDED

    artifacts = (await db_session.scalars(select(Artifact).where(Artifact.run_id == run.id))).all()
    kinds = {artifact.kind for artifact in artifacts}
    assert kinds == {"topic_proposal", "literature_brief", "research_design", "research_plan"}
    assert all(artifact.status == "approved" for artifact in artifacts)
    topic_artifacts = [artifact for artifact in artifacts if artifact.kind == "topic_proposal"]
    assert len(topic_artifacts) == 1
    literature = next(artifact for artifact in artifacts if artifact.kind == "literature_brief")
    assert literature.content["evidence"]["retrievedSourceCount"] == 1
    assert literature.content["evidence"]["structuredEntryCount"] == 1
    assert "not a completed systematic review" in literature.content["text"]

    evidence = (await db_session.scalars(select(Evidence).where(Evidence.run_id == run.id))).all()
    assert len(evidence) == 1  # deduplicated across the two litreview executions? (litreview runs once)

    events = (await db_session.scalars(select(RunEvent).where(RunEvent.run_id == run.id))).all()
    step_types = [event.type for event in events]
    for step in ("topic", "litreview", "design", "quality", "summary"):
        assert "step.started" in step_types or any(
            event.type == "step.started" and event.data.get("step") == step for event in events
        )
    steps_result = [step.get("step") for step in (run.result or {}).get("steps", [])]
    assert steps_result and steps_result[-1] != "summary"  # summary lives in `final`


async def _stub_registry_call(name, params):  # noqa: ANN001
    del name, params
    return _TOOL_RESULT


@pytest.mark.asyncio
async def test_workflow_abort_at_topic_gate(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_model_patch(monkeypatch)
    monkeypatch.setattr(registry_module.registry, "call", _stub_registry_call)

    run = await _seed_run(db_session)
    assert await _drive(db_session, run) == {"interrupted": True}

    outcome = await _drive(db_session, run, resume={"approved": False})
    assert outcome == {"interrupted": False}
    await db_session.refresh(run)
    assert run.status == RunStatus.SUCCEEDED
    assert (run.result or {}).get("aborted") is True
    artifacts = (await db_session.scalars(select(Artifact).where(Artifact.run_id == run.id))).all()
    # Only the topic proposal exists; nothing downstream was produced.
    assert {artifact.kind for artifact in artifacts} == {"topic_proposal"}
    assert all(artifact.status == "rejected" for artifact in artifacts)


@pytest.mark.asyncio
async def test_workflow_revision_loop_is_bounded(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_model_patch(monkeypatch)
    monkeypatch.setattr(registry_module.registry, "call", _stub_registry_call)
    # Force the quality gate to demand one revision…
    monkeypatch.setitem(model_module._FAKE_PAYLOADS, "quality", {"verdict": "revise", "issues": [
        {"step": "design", "severity": "high", "note": "hypotheses too vague"},
    ]})

    run = await _seed_run(db_session)
    assert await _drive(db_session, run) == {"interrupted": True}
    await _drive(db_session, run, resume={"approved": True, "selected": "Candidate 2"})

    outcome = await _drive(db_session, run, resume={"approved": True})
    assert outcome == {"interrupted": False}
    await db_session.refresh(run)
    assert run.status == RunStatus.SUCCEEDED

    result = run.result or {}
    assert result.get("quality", {}).get("verdict") == "revise"  # revise again after the loop → summarized anyway
    design_entries = [step for step in result.get("steps", []) if step.get("step") == "design"]
    assert len(design_entries) == 2  # initial + one revision, then the loop stops
