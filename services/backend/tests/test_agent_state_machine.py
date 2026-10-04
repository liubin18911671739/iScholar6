"""Durable `/v1/agent/*` state-machine contracts (PostgreSQL-backed).

Skipped automatically when no database is reachable (see `conftest.py`); run
with `pnpm agent:test` against the compose Postgres.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.runtime import claim_next_run, execute_run
from app.core.config import Settings
from app.core.security import sign_identity
from app.models import AgentRun, AgentThread, Artifact, Project, RunEvent, RunStatus


async def _seed_user(session: AsyncSession) -> uuid.UUID:
    user_id = uuid.uuid4()
    await session.execute(
        text("INSERT INTO users (id, email, password_hash, role) VALUES (:id, :email, 'x', 'learner')"),
        {"id": str(user_id), "email": f"{user_id}@test.local"},
    )
    return user_id


async def _seed_thread(session: AsyncSession, owner: uuid.UUID) -> tuple[Project, AgentThread]:
    project = Project(owner_id=owner, name="state-machine project")
    session.add(project)
    await session.flush()
    thread = AgentThread(project_id=project.id, owner_id=owner)
    session.add(thread)
    await session.commit()
    return project, thread


async def _seed_run(
    session: AsyncSession, thread: AgentThread, owner: uuid.UUID, *, status: str = RunStatus.QUEUED
) -> AgentRun:
    run = AgentRun(
        thread_id=thread.id, project_id=thread.project_id, owner_id=owner, agent="write", goal="draft methods", status=status
    )
    session.add(run)
    await session.commit()
    return run


@pytest.mark.asyncio
async def test_run_creation_is_idempotent_per_key(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    headers = {**sign_identity(str(owner)), "Idempotency-Key": "idem-1"}
    body = {"threadId": str(thread.id), "goal": "write a methods section", "agent": "write"}

    first = await client.post("/v1/agent/runs", json=body, headers=headers)
    second = await client.post("/v1/agent/runs", json=body, headers=headers)

    assert first.status_code == 202 and second.status_code == 202
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    count = await db_session.scalar(
        select(func.count()).select_from(AgentRun).where(AgentRun.idempotency_key == "idem-1")
    )
    assert count == 1


@pytest.mark.asyncio
async def test_idempotency_key_is_owner_scoped(client, db_session: AsyncSession) -> None:
    owner_a = await _seed_user(db_session)
    _, thread_a = await _seed_thread(db_session, owner_a)
    owner_b = await _seed_user(db_session)
    _, thread_b = await _seed_thread(db_session, owner_b)

    a = await client.post(
        "/v1/agent/runs",
        json={"threadId": str(thread_a.id), "goal": "goal one", "agent": "write"},
        headers={**sign_identity(str(owner_a)), "Idempotency-Key": "shared"},
    )
    b = await client.post(
        "/v1/agent/runs",
        json={"threadId": str(thread_b.id), "goal": "goal two", "agent": "write"},
        headers={**sign_identity(str(owner_b)), "Idempotency-Key": "shared"},
    )

    assert a.status_code == 202 and b.status_code == 202
    assert a.json()["data"]["id"] != b.json()["data"]["id"]


@pytest.mark.asyncio
async def test_resume_rejects_run_that_is_not_waiting(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.QUEUED)

    response = await client.post(
        f"/v1/agent/runs/{run.id}/resume", json={"approved": True}, headers=sign_identity(str(owner))
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "RUN_NOT_WAITING"


@pytest.mark.asyncio
async def test_resume_moves_waiting_run_back_to_queued(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.WAITING_FOR_REVIEW)

    response = await client.post(
        f"/v1/agent/runs/{run.id}/resume", json={"approved": True}, headers=sign_identity(str(owner))
    )
    assert response.status_code == 202
    assert response.json()["data"]["status"] == RunStatus.QUEUED
    await db_session.refresh(run)
    assert run.resume_input == {"approved": True}
    events = (await db_session.scalars(select(RunEvent).where(RunEvent.run_id == run.id))).all()
    assert any(event.type == "run.resumed" for event in events)


@pytest.mark.asyncio
async def test_cancel_queued_run_is_immediate(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.QUEUED)

    response = await client.post(f"/v1/agent/runs/{run.id}/cancel", headers=sign_identity(str(owner)))
    assert response.status_code == 202
    assert response.json()["data"]["status"] == RunStatus.CANCELLED
    await db_session.refresh(run)
    assert run.cancel_requested is True


@pytest.mark.asyncio
async def test_cancel_rejects_finished_run(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.SUCCEEDED)

    response = await client.post(f"/v1/agent/runs/{run.id}/cancel", headers=sign_identity(str(owner)))
    assert response.status_code == 409
    assert response.json()["detail"] == "RUN_ALREADY_FINISHED"


@pytest.mark.asyncio
async def test_cancel_running_run_requests_cooperative_stop(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.RUNNING)

    response = await client.post(f"/v1/agent/runs/{run.id}/cancel", headers=sign_identity(str(owner)))
    assert response.status_code == 202
    assert response.json()["data"]["status"] == RunStatus.RUNNING
    await db_session.refresh(run)
    assert run.cancel_requested is True


@pytest.mark.asyncio
async def test_events_stream_resumes_after_sequence(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.SUCCEEDED)
    for sequence in (1, 2, 3):
        db_session.add(RunEvent(run_id=run.id, sequence=sequence, type="message.delta", data={"text": f"chunk-{sequence}"}))
    await db_session.commit()

    response = await client.get(f"/v1/agent/runs/{run.id}/events?after=2", headers=sign_identity(str(owner)))

    assert response.status_code == 200
    body = response.text
    assert "chunk-1" not in body and "chunk-2" not in body
    assert "chunk-3" in body
    assert "event: end" in body


@pytest.mark.asyncio
async def test_worker_run_interrupts_then_resumes(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Force the deterministic model regardless of a real DEEPSEEK_API_KEY.
    monkeypatch.setattr("app.agents.model.get_settings", lambda: Settings(agent_model_fake=True, deepseek_api_key=None))

    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.QUEUED)

    claimed = await claim_next_run(db_session)
    await db_session.commit()
    assert claimed is not None and claimed.id == run.id
    assert claimed.status == RunStatus.RUNNING

    first = await execute_run(db_session, claimed)
    await db_session.commit()
    assert first == {"interrupted": True}
    assert claimed.status == RunStatus.WAITING_FOR_REVIEW

    claimed.status = RunStatus.QUEUED
    claimed.resume_input = {"approved": True}
    await db_session.commit()

    second = await execute_run(db_session, claimed)
    await db_session.commit()
    assert second == {"interrupted": False}
    assert claimed.status == RunStatus.SUCCEEDED

    artifacts = (await db_session.scalars(select(Artifact).where(Artifact.run_id == run.id))).all()
    assert len(artifacts) == 1
    assert artifacts[0].status == "approved"
