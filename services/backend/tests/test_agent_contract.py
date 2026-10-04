"""Contract-level checks that do not need Postgres or a model key."""

from fastapi.testclient import TestClient

from app.api.v1.agent import ArtifactReview, RunCreate, ThreadCreate, sse_frame
from app.main import app

client = TestClient(app)

RUN_ID = "00000000-0000-0000-0000-000000000003"
THREAD_ID = "00000000-0000-0000-0000-000000000001"
PROJECT_ID = "00000000-0000-0000-0000-000000000002"


def test_run_request_accepts_builtin_agent() -> None:
    request = RunCreate(
        thread_id=THREAD_ID,
        goal="Find evidence about reproducible research",
        agent="litreview",
    )
    assert request.agent == "litreview"


def test_run_request_rejects_unknown_agent() -> None:
    try:
        RunCreate(thread_id=THREAD_ID, goal="Find evidence", agent="unknown")
    except ValueError:
        return
    raise AssertionError("unknown agent must not enter the harness")


def test_run_request_camelcase_and_training_fields() -> None:
    body = RunCreate.model_validate(
        {
            "threadId": THREAD_ID,
            "goal": "Coach run",
            "agent": "coach",
            "systemPrompt": "sys",
            "userPrompt": "usr",
            "trainingTaskId": "research-question",
            "programId": PROJECT_ID,
            "mode": "coach",
        }
    )
    assert body.thread_id is not None
    assert body.system_prompt == "sys"
    assert body.training_task_id == "research-question"
    assert body.mode == "coach"


def test_run_request_accepts_plugin_agent() -> None:
    body = RunCreate(thread_id=THREAD_ID, goal="Plugin run", agent="p.demo.polisher")
    assert body.agent == "p.demo.polisher"


def test_thread_create_camelcase_alias() -> None:
    body = ThreadCreate.model_validate({"projectId": PROJECT_ID, "title": "t"})
    assert str(body.project_id) == PROJECT_ID


def test_artifact_review_body() -> None:
    body = ArtifactReview.model_validate({"status": "approved", "feedback": "ok"})
    assert body.status == "approved"


def test_agent_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    assert {
        "/v1/agent/threads",
        "/v1/agent/runs",
        "/v1/agent/runs/{run_id}",
        "/v1/agent/runs/{run_id}/resume",
        "/v1/agent/runs/{run_id}/cancel",
        "/v1/agent/runs/{run_id}/events",
        "/v1/agent/artifacts/{artifact_id}/review",
    } <= paths


def test_sse_frame_sequenced_and_unnamed() -> None:
    framed = sse_frame("message.delta", {"text": "hi"}, sequence=7)
    assert framed == 'id: 7\nevent: message.delta\ndata: {"text": "hi"}\n\n'
    # The terminal frame carries no sequence id.
    assert sse_frame("end", {"status": "succeeded"}) == 'event: end\ndata: {"status": "succeeded"}\n\n'


def test_agent_routes_reject_missing_identity() -> None:
    for method, path in [
        ("get", f"/v1/agent/runs/{RUN_ID}"),
        ("get", f"/v1/agent/runs/{RUN_ID}/events"),
        ("post", f"/v1/agent/runs/{RUN_ID}/resume"),
        ("post", f"/v1/agent/runs/{RUN_ID}/cancel"),
        ("post", "/v1/agent/artifacts/00000000-0000-0000-0000-000000000004/review"),
    ]:
        response = getattr(client, method)(path, json={}) if method == "post" else getattr(client, method)(path)
        assert response.status_code == 401, path
        assert response.json()["detail"] == "MISSING_SERVICE_IDENTITY"


def test_resume_body_aliases() -> None:
    from app.api.v1.agent import ResumeBody

    body = ResumeBody.model_validate({"approved": True, "input": {"note": "ok"}})
    assert body.approved is True
    assert body.input == {"note": "ok"}


def test_run_request_mode_is_free_text_here() -> None:
    # `mode` is validated in the route (coach|production), not the request model.
    body = RunCreate(thread_id=THREAD_ID, goal="Coach run", agent="coach", mode="coach")
    assert body.mode == "coach"
