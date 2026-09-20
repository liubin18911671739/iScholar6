"""Contract-level checks that do not need Postgres or a model key."""

from app.api.v1.agent import RunCreate


def test_run_request_accepts_builtin_agent() -> None:
    request = RunCreate(
        thread_id="00000000-0000-0000-0000-000000000001",
        goal="Find evidence about reproducible research",
        agent="litreview",
    )
    assert request.agent == "litreview"


def test_run_request_rejects_unknown_agent() -> None:
    try:
        RunCreate(thread_id="00000000-0000-0000-0000-000000000001", goal="Find evidence", agent="unknown")
    except ValueError:
        return
    raise AssertionError("unknown agent must not enter the harness")
