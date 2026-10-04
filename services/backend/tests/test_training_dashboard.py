"""Cross-program dashboard + LMS gradebook pure-logic parity (no DB)."""

from __future__ import annotations

from app.training.lms_gradebook import (
    build_lms_gradebook_rows,
    to_ags_score_lines,
    to_unit_score,
)
from app.training.reporting_v2 import (
    build_risk_heatmap,
    build_semester_dashboard,
    score_risk_cell,
    to_cross_program_row,
)

SNAPSHOT = {
    "programId": "p1",
    "name": "Camp",
    "status": "active",
    "cohortName": None,
    "startDate": None,
    "endDate": None,
    "report": {
        "memberCount": 2,
        "activeCount": 2,
        "removedCount": 0,
        "funnel": {},
        "byTask": [
            {
                "taskId": "t1",
                "title": "Task",
                "learners": 2,
                "submitted": 2,
                "approved": 1,
                "submitRate": 100,
                "approveRate": 50,
                "avgScore": 80,
            }
        ],
        "reviewLoad": {"pending": 1, "avgWaitHours": 2.5, "byReviewer": [{"reviewerId": "r1", "count": 1}]},
        "risk": [{"learnerId": "l1", "displayName": "A", "revisionCount": 2, "escalatedCount": 0}],
        "avgCompletionRate": 75,
    },
}


def test_to_cross_program_row() -> None:
    row = to_cross_program_row(SNAPSHOT)
    assert row["memberCount"] == 2
    assert row["avgCompletionRate"] == 75
    assert row["pendingReviews"] == 1
    assert row["avgWaitHours"] == 2.5
    assert row["riskCount"] == 1
    assert row["submitRateAvg"] == 100
    assert row["approveRateAvg"] == 50


def test_build_semester_dashboard_rollup_and_kpis() -> None:
    dashboard = build_semester_dashboard(
        from_date="2026-01-01",
        to_date="2026-09-30",
        snapshots=[SNAPSHOT],
        reviews=[
            {"reviewer_id": "r1", "decision": "approved", "score": 90},
            {"reviewer_id": "r1", "decision": "needs_revision", "score": None},
        ],
    )
    assert dashboard["totals"] == {
        "programs": 1,
        "members": 2,
        "pendingReviews": 1,
        "avgCompletionRate": 75,
    }
    kpi = dashboard["reviewerKpis"][0]
    assert kpi == {
        "reviewerId": "r1",
        "reviewCount": 2,
        "approved": 1,
        "needsRevision": 1,
        "escalated": 0,
        "avgScore": 90,
    }


def test_score_risk_cell_and_heatmap() -> None:
    assert score_risk_cell(revision_count=2, escalated_count=1) == {
        "score": 75,
        "reasons": ["revisions:2", "escalated:1"],
    }
    heatmap = build_risk_heatmap(
        learners=[{"learnerId": "l1", "displayName": "A"}],
        task_ids=["t1"],
        cells=[{"learnerId": "l1", "taskId": "t1", "revisionCount": 1, "escalatedCount": 0}],
    )
    assert heatmap["cells"][0]["displayName"] == "A"
    assert heatmap["cells"][0]["score"] == 15


def test_lms_gradebook_formats() -> None:
    learners = [
        {
            "learnerId": "l1",
            "displayName": "Ada Lovelace",
            "email": "ada@example.com",
            "overall": 80,
            "status": "completed",
            "taskScores": {"t1": 80},
        }
    ]
    assert to_unit_score(80) == 0.8
    canvas = build_lms_gradebook_rows(learners, "canvas")[0]
    assert canvas["Student"] == "Ada Lovelace"
    assert canvas["Overall (0-1)"] == 0.8
    moodle = build_lms_gradebook_rows(learners, "moodle")[0]
    assert moodle["First name"] == "Ada"
    assert moodle["Last name"] == "Lovelace"
    generic = build_lms_gradebook_rows(learners, "generic")[0]
    assert generic["learner_id"] == "l1"
    assert generic["score_t1"] == 80
    ags = to_ags_score_lines(learners, "urn:test")
    assert ags[0]["userId"] == "l1"
    assert ags[0]["gradingProgress"] == "FullyGraded"
