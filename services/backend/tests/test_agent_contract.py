"""Contract-level checks that do not need Postgres or a model key."""

from app.api.v1.agent import ArtifactReview, RunCreate, ThreadCreate
from app.main import app

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
