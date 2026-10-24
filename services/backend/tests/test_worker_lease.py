"""Worker lease, reaper, and review→resume reliability contracts (PG-backed)."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.harness import AgentHarness, RunStale
from app.agents.model import StreamResult
from app.agents.runtime import _finalize_run, claim_next_run, reap_stale_runs
from app.core.security import sign_identity
from app.models import AgentRun, Artifact, RunEvent, RunStatus
from app.models.domain import now
from tests.test_agent_state_machine import _seed_run, _seed_thread, _seed_user


def _test_session_factory(session):
    @asynccontextmanager
    async def _factory():
        yield session

    return _factory


async def _expire_lease(session: AsyncSession, run: AgentRun, *, attempt: int = 1) -> None:
    run.status = RunStatus.RUNNING
    run.lease_token = uuid.uuid4()
    run.lease_expires_at = now() - timedelta(seconds=1)
    run.attempt = attempt
    await session.commit()


@pytest.mark.asyncio
async def test_claim_issues_lease(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    await _seed_run(db_session, thread, owner)

    claimed = await claim_next_run(db_session)
    await db_session.commit()

    assert claimed is not None
    assert claimed.status == RunStatus.RUNNING
    assert claimed.lease_token is not None
    assert claimed.lease_expires_at is not None and claimed.lease_expires_at > now()
    assert claimed.attempt == 1


@pytest.mark.asyncio
async def test_reaper_requeues_expired_run(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    await _expire_lease(db_session, run)

    recovered = await reap_stale_runs(db_session)

    assert recovered == 1
    await db_session.refresh(run)
    assert run.status == RunStatus.QUEUED
    assert run.lease_token is None and run.lease_expires_at is None
    events = (await db_session.scalars(select(RunEvent).where(RunEvent.run_id == run.id))).all()
    assert any(event.type == "run.requeued" for event in events)


@pytest.mark.asyncio
async def test_reaper_cancels_cancel_requested_run(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    await _expire_lease(db_session, run)
    run.cancel_requested = True
    await db_session.commit()

    await reap_stale_runs(db_session)

    await db_session.refresh(run)
    assert run.status == RunStatus.CANCELLED
    assert run.completed_at is not None


@pytest.mark.asyncio
async def test_reaper_fails_after_max_attempts(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    await _expire_lease(db_session, run, attempt=3)

    await reap_stale_runs(db_session)

    await db_session.refresh(run)
    assert run.status == RunStatus.FAILED
    assert run.error == "RUN_LEASE_EXPIRED_MAX_ATTEMPTS"


@pytest.mark.asyncio
async def test_reaper_ignores_live_lease(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    claimed = await claim_next_run(db_session)
    await db_session.commit()
    assert claimed is not None and claimed.id == run.id

    recovered = await reap_stale_runs(db_session)

    assert recovered == 0
    await db_session.refresh(run)
    assert run.status == RunStatus.RUNNING


@pytest.mark.asyncio
async def test_stale_worker_cannot_finalize_re_claimed_run(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    run.status = RunStatus.QUEUED
    await db_session.commit()

    first = await claim_next_run(db_session)
    await db_session.commit()
    assert first is not None
    stale_token = str(first.lease_token)

    # Reaper re-queues; the second worker claims with a fresh lease.
    await _expire_lease(db_session, first, attempt=1)
    await reap_stale_runs(db_session)
    second = await claim_next_run(db_session)
    await db_session.commit()
    assert second is not None and second.lease_token is not None
    assert str(second.lease_token) != stale_token

    assert await _finalize_run(db_session, run.id, stale_token, status=RunStatus.SUCCEEDED) is False
    assert await _finalize_run(db_session, run.id, str(second.lease_token), status=RunStatus.SUCCEEDED) is True
    await db_session.refresh(run)
    assert run.status == RunStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_ensure_active_detects_lost_lease(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.RUNNING)
    harness = AgentHarness(
        session=db_session, run_id=str(run.id), allowed_tools=set(), lease_token=str(uuid.uuid4())
    )

    # No lease recorded (legacy/other-owner rows): lease check is skipped.
    await harness.ensure_active()

    stale_token = str(uuid.uuid4())
    run.lease_token = uuid.uuid4()
    await db_session.commit()
    stale = AgentHarness(session=db_session, run_id=str(run.id), allowed_tools=set(), lease_token=stale_token)
    with pytest.raises(RunStale):
        await stale.ensure_active()


@pytest.mark.asyncio
async def test_events_commit_immediately_without_outer_flush(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.RUNNING)
    harness = AgentHarness(session=db_session, run_id=str(run.id), allowed_tools=set())

    await harness.emit("test.tick", {"n": 1})

    # emit() itself committed the savepoint: no transaction is held open.
    assert not db_session.in_transaction()
    count = await db_session.scalar(select(func.count()).select_from(RunEvent).where(RunEvent.run_id == run.id))
    assert count == 1


@pytest.mark.asyncio
async def test_stream_model_emits_during_generation(db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.RUNNING)

    class _SpyHarness(AgentHarness):
        def __init__(self) -> None:
            super().__init__(session=db_session, run_id=str(run.id), allowed_tools=set())
            self.order: list[str] = []

        async def emit(self, event_type: str, data):  # type: ignore[override]
            self.order.append(f"emit:{event_type}")
            await super().emit(event_type, data)

    class _OrderingModel:
        """Emits one full chunk mid-stream, then a remainder chunk."""

        def __init__(self, harness: _SpyHarness) -> None:
            self.harness = harness

        async def stream(self, system: str, user: str, on_delta):
            await on_delta("a" * 160)
            # Marks that the first delta was emitted mid-generation, before
            # stream_model flushes any remainder.
            self.harness.order.append("model:continued")
            await on_delta("b" * 10)
            return StreamResult(text="a" * 160 + "b" * 10, token_in=1, token_out=2)

    spy = _SpyHarness()
    result = await spy.stream_model(_OrderingModel(spy), "sys", "user")  # type: ignore[arg-type]

    # First delta committed while the model was still mid-stream; the
    # remainder flushes after the stream ends.
    assert spy.order == ["emit:message.delta", "model:continued", "emit:message.delta"]
    assert result.text == "a" * 160 + "b" * 10


@pytest.mark.asyncio
async def test_artifact_review_resumes_waiting_run(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    project, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.WAITING_FOR_REVIEW)
    artifact = Artifact(
        run_id=run.id,
        project_id=project.id,
        kind="manuscript_draft",
        status="draft",
        content={"text": "draft"},
        idempotency_key="review-k",
    )
    db_session.add(artifact)
    await db_session.commit()

    response = await client.post(
        f"/v1/agent/artifacts/{artifact.id}/review",
        json={"status": "approved"},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "approved"
    await db_session.refresh(run)
    assert run.status == RunStatus.QUEUED
    assert run.resume_input == {"approved": True}

    # A second decision while the resumed run is in flight conflicts.
    conflict = await client.post(
        f"/v1/agent/artifacts/{artifact.id}/review",
        json={"status": "rejected"},
        headers=sign_identity(str(owner)),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "RUN_IN_FLIGHT"


@pytest.mark.asyncio
async def test_artifact_review_rejecting_resumes_with_false(client, db_session: AsyncSession) -> None:
    owner = await _seed_user(db_session)
    project, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner, status=RunStatus.WAITING_FOR_REVIEW)
    artifact = Artifact(
        run_id=run.id,
        project_id=project.id,
        kind="manuscript_draft",
        status="draft",
        content={"text": "draft"},
        idempotency_key="review-k2",
    )
    db_session.add(artifact)
    await db_session.commit()

    response = await client.post(
        f"/v1/agent/artifacts/{artifact.id}/review",
        json={"status": "rejected"},
        headers=sign_identity(str(owner)),
    )
    assert response.status_code == 200
    await db_session.refresh(run)
    assert run.status == RunStatus.QUEUED
    assert run.resume_input == {"approved": False}


@pytest.mark.asyncio
async def test_finalize_run_failed_marks_failed_and_guards_lease(db_session: AsyncSession) -> None:
    from contextlib import asynccontextmanager

    from app.agents.runtime import finalize_run_failed

    # finalize_run_failed owns a `session.begin()` lifecycle: any query the test
    # runs in between leaves an autobegin txn open that would make the next
    # begin() raise, so the factory closes it through a savepoint-safe commit.
    @asynccontextmanager
    async def _factory():
        if db_session.in_transaction():
            await db_session.commit()
        yield db_session

    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    claimed = await claim_next_run(db_session)
    await db_session.commit()
    assert claimed is not None and claimed.id == run.id

    run_id = str(run.id)
    live_lease = str(claimed.lease_token)

    # A stale worker cannot fail another owner's run.
    await finalize_run_failed(_factory, run_id, str(uuid.uuid4()), "boom")
    await db_session.refresh(run)
    assert run.status == RunStatus.RUNNING
    assert run.error is None and run.completed_at is None

    # With the live lease the run fails fast and emits run.failed.
    await finalize_run_failed(_factory, run_id, live_lease, "boom")
    await db_session.refresh(run)
    assert run.status == RunStatus.FAILED
    assert run.error == "boom"
    assert run.completed_at is not None
    events = (await db_session.scalars(select(RunEvent).where(RunEvent.run_id == run.id))).all()
    assert any(event.type == "run.failed" for event in events)


@pytest.mark.asyncio
async def test_heartbeat_extends_lease(db_session: AsyncSession) -> None:
    from app.worker import _heartbeat_loop

    owner = await _seed_user(db_session)
    _, thread = await _seed_thread(db_session, owner)
    run = await _seed_run(db_session, thread, owner)
    claimed = await claim_next_run(db_session)
    await db_session.commit()
    assert claimed is not None
    lease_token = str(claimed.lease_token)

    # Put the lease in the past; a single heartbeat cycle must push it forward.
    claimed.lease_expires_at = now() - timedelta(seconds=5)
    await db_session.commit()

    stop = asyncio.Event()
    task = asyncio.create_task(
        _heartbeat_loop(_test_session_factory(db_session), run.id, lease_token, 3600, stop)
    )
    for _ in range(50):
        await asyncio.sleep(0.02)
        await db_session.refresh(run)
        if run.lease_expires_at and run.lease_expires_at > now():
            break
    stop.set()
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):
        pass
    await db_session.refresh(run)
    assert run.lease_expires_at is not None and run.lease_expires_at > now()
