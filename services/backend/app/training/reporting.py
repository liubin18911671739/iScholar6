"""Class-level training report aggregation (port of ``lib/training/reporting.ts``)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.training.progress import (
    ProgramTaskConfig,
    ReviewLike,
    SubmissionLike,
    build_class_progress,
    resolve_program_curriculum,
)

_STATUSES = ("not_started", "draft", "submitted", "needs_revision", "approved", "escalated")


def _empty_funnel() -> dict[str, int]:
    return {status: 0 for status in _STATUSES}


def build_class_report(
    curriculum_configs: list[ProgramTaskConfig] | None,
    enrollments: list[dict],
    submissions: list[SubmissionLike],
    reviews: list[ReviewLike],
    now: datetime | None = None,
) -> dict:
    """Pure class-level report aggregation for training camps."""
    reference = now or datetime.now(UTC)
    curriculum = resolve_program_curriculum(curriculum_configs)
    active = [e for e in enrollments if e.get("status") != "removed"]
    removed = [e for e in enrollments if e.get("status") == "removed"]

    members = build_class_progress(curriculum, enrollments, submissions, reviews, reference)

    funnel = _empty_funnel()
    for member in members:
        for task in member["tasks"]:
            if task["required"]:
                funnel[task["status"]] += 1

    active_count = len(active)
    by_task = []
    for cfg, definition in curriculum:
        submitted = 0
        approved = 0
        scores: list[int] = []
        for member in members:
            cell = next((t for t in member["tasks"] if t["taskId"] == cfg.task_id), None)
            if cell is None:
                continue
            if cell["status"] not in ("not_started", "draft"):
                submitted += 1
            if cell["status"] == "approved":
                approved += 1
            if isinstance(cell.get("score"), int):
                scores.append(cell["score"])
        learners = max(active_count, 1)
        by_task.append(
            {
                "taskId": cfg.task_id,
                "title": definition.title,
                "learners": active_count,
                "submitted": submitted,
                "approved": approved,
                "submitRate": 0 if active_count == 0 else round(submitted / learners * 100),
                "approveRate": 0 if active_count == 0 else round(approved / learners * 100),
                "avgScore": None if not scores else round(sum(scores) / len(scores)),
            }
        )

    pending = [s for s in submissions if s.status == "submitted"]
    waits = []
    for submission in pending:
        if submission.updated_at is None:
            continue
        updated = submission.updated_at if submission.updated_at.tzinfo else submission.updated_at.replace(tzinfo=UTC)
        waits.append((reference - updated).total_seconds() * 1000)
    waits = [ms for ms in waits if ms > 0]
    avg_wait_hours = None if not waits else round(sum(waits) / len(waits) / 3_600_000, 1)

    by_reviewer: dict[str, int] = {}
    for review in reviews:
        if review.reviewer_id:
            by_reviewer[review.reviewer_id] = by_reviewer.get(review.reviewer_id, 0) + 1

    revision_by_learner: dict[str, int] = {}
    escalated_by_learner: dict[str, int] = {}
    for review in reviews:
        if review.decision == "needs_revision":
            revision_by_learner[review.learner_id] = revision_by_learner.get(review.learner_id, 0) + 1
        if review.decision == "escalated":
            escalated_by_learner[review.learner_id] = escalated_by_learner.get(review.learner_id, 0) + 1

    risk = [
        {
            "learnerId": e["learner_id"],
            "displayName": e.get("display_name"),
            "revisionCount": revision_by_learner.get(e["learner_id"], 0),
            "escalatedCount": escalated_by_learner.get(e["learner_id"], 0),
        }
        for e in active
    ]
    risk = [r for r in risk if r["revisionCount"] >= 2 or r["escalatedCount"] >= 1]
    risk.sort(key=lambda r: r["revisionCount"] + r["escalatedCount"] * 2, reverse=True)

    avg_completion_rate = 0 if not members else round(sum(m["completionRate"] for m in members) / len(members))

    return {
        "memberCount": len(enrollments),
        "activeCount": active_count,
        "removedCount": len(removed),
        "funnel": funnel,
        "byTask": by_task,
        "reviewLoad": {
            "pending": len(pending),
            "avgWaitHours": avg_wait_hours,
            "byReviewer": [{"reviewerId": rid, "count": count} for rid, count in by_reviewer.items()],
        },
        "risk": risk,
        "avgCompletionRate": avg_completion_rate,
    }
