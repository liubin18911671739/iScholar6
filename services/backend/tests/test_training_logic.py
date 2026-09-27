"""Pure training-logic parity tests (no database)."""

from datetime import UTC, datetime, timedelta

from app.training.calendar import build_month_grid, collect_due_events, to_date_key
from app.training.catalog import BUILTIN_TASKS, mvp_task_ids, task_title
from app.training.certificate import assess_completion, build_payload, hash_payload, verify_hash
from app.training.progress import (
    ProgramTaskConfig,
    ReviewLike,
    SubmissionLike,
    build_class_progress,
    build_learner_progress,
    derive_task_status,
    is_overdue,
    resolve_program_curriculum,
)
from app.training.reporting import build_class_report

NOW = datetime(2026, 9, 27, tzinfo=UTC)


def test_catalog_has_eight_tasks() -> None:
    assert len(BUILTIN_TASKS) == 8
    assert mvp_task_ids()[0] == "research-question"
    assert task_title("research-question") != "research-question"
    assert task_title("unknown-task") == "unknown-task"


def test_resolve_curriculum_fallback_and_configs() -> None:
    fallback = resolve_program_curriculum(None)
    assert len(fallback) == 8
    assert fallback[0][0].task_id == "research-question"

    configured = resolve_program_curriculum(
        [ProgramTaskConfig(task_id="research-design", ordinal=0, required=True)]
    )
    assert [cfg.task_id for cfg, _ in configured] == ["research-design"]


def test_derive_task_status_matrix() -> None:
    assert derive_task_status(None, None) == "not_started"
    assert derive_task_status("in_progress", None) == "draft"
    assert derive_task_status("submitted", None) == "submitted"
    assert derive_task_status("completed", None) == "approved"
    assert derive_task_status("submitted", "approved") == "approved"
    assert derive_task_status("submitted", "needs_revision") == "needs_revision"
    assert derive_task_status("escalated", None) == "escalated"


def test_is_overdue() -> None:
    past = NOW - timedelta(days=1)
    future = NOW + timedelta(days=1)
    assert is_overdue("submitted", past, NOW) is True
    assert is_overdue("approved", past, NOW) is False
    assert is_overdue("submitted", future, NOW) is False
    assert is_overdue("submitted", None, NOW) is False


def test_build_learner_progress_completion() -> None:
    curriculum = resolve_program_curriculum(
        [
            ProgramTaskConfig(task_id="research-question", ordinal=0, required=True),
            ProgramTaskConfig(task_id="research-design", ordinal=1, required=True),
        ]
    )
    submissions = [SubmissionLike("research-question", "u1", "completed", NOW)]
    reviews = {"research-question": ReviewLike("research-question", "u1", "approved", NOW, score=90)}
    progress = build_learner_progress(curriculum, submissions, reviews, now=NOW)
    assert progress.required_total == 2
    assert progress.required_done == 1
    assert progress.completion_rate == 50
    assert progress.tasks[0]["status"] == "approved"
    assert progress.tasks[1]["status"] == "not_started"


def test_build_class_report_aggregates() -> None:
    report = build_class_report(
        [ProgramTaskConfig(task_id="research-question", ordinal=0, required=True)],
        [
            {"learner_id": "u1", "status": "active", "display_name": "A"},
            {"learner_id": "u2", "status": "removed", "display_name": "B"},
        ],
        [SubmissionLike("research-question", "u1", "submitted", NOW)],
        [
            ReviewLike("research-question", "u1", "needs_revision", NOW, reviewer_id="r1"),
            ReviewLike("research-question", "u1", "needs_revision", NOW - timedelta(days=1), reviewer_id="r1"),
        ],
        now=NOW,
    )
    assert report["memberCount"] == 2
    assert report["activeCount"] == 1
    assert report["removedCount"] == 1
    assert report["reviewLoad"]["pending"] == 1
    assert report["risk"][0]["learnerId"] == "u1"


def test_certificate_eligibility_and_hash() -> None:
    eligible = assess_completion(["a", "b"], {"a": "approved", "b": "completed"})
    assert eligible["eligible"] is True
    assert eligible["missingRequired"] == []

    ineligible = assess_completion(["a", "b"], {"a": "approved", "b": "not_started"})
    assert ineligible["eligible"] is False
    assert ineligible["missingRequired"] == ["b"]

    payload = build_payload("p1", "Camp", "u1", "A", ["a"], ["a"], completed_at="2026-09-27T00:00:00Z")
    digest = hash_payload(payload)
    assert len(digest) == 64
    assert verify_hash(payload, digest.upper()) is True
    assert verify_hash({**payload, "programName": "Tampered"}, digest) is False


def test_calendar_events_and_grid() -> None:
    events = collect_due_events(
        [{"id": "p1", "name": "Camp", "start_date": "2026-09-01", "end_date": "2026-09-30"}],
        [{"program_id": "p1", "task_id": "t1", "due_at": "2026-09-15T00:00:00Z", "title": "Task"}],
    )
    kinds = {event["kind"] for event in events}
    assert kinds == {"program_start", "program_end", "task_due"}
    assert to_date_key("2026-09-15T12:00:00Z") == "2026-09-15"

    grid = build_month_grid(2026, 9, events)
    assert len(grid) == 30
    day = next(d for d in grid if d["date"] == "2026-09-15")
    assert len(day["events"]) == 1


def test_build_class_progress_marks_removed() -> None:
    rows = build_class_progress(
        resolve_program_curriculum([ProgramTaskConfig(task_id="research-question", ordinal=0)]),
        [
            {"learner_id": "u1", "status": "active", "display_name": "A"},
            {"learner_id": "u2", "status": "removed", "display_name": "B"},
        ],
        [],
        [],
        now=NOW,
    )
    assert [row["learnerId"] for row in rows] == ["u1"]
