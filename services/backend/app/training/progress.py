"""Per-learner and per-class training progress (port of ``lib/training/progress.ts``)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.training.catalog import BUILTIN_TASKS, TaskDefinition, get_task

DONE_STATUSES = {"approved", "completed"}


@dataclass
class ProgramTaskConfig:
    task_id: str
    ordinal: int
    due_at: datetime | None = None
    required: bool = True
    requires_review_override: bool | None = None


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def resolve_program_curriculum(
    configs: list[ProgramTaskConfig] | None,
) -> list[tuple[ProgramTaskConfig, TaskDefinition]]:
    """Configured tasks (sorted by ordinal) or the full MVP fallback."""
    if configs:
        source = sorted(configs, key=lambda c: c.ordinal)
    else:
        source = [
            ProgramTaskConfig(task_id=task.id, ordinal=index, due_at=None, required=True)
            for index, task in enumerate(BUILTIN_TASKS)
        ]
    resolved: list[tuple[ProgramTaskConfig, TaskDefinition]] = []
    for cfg in source:
        definition = get_task(cfg.task_id)
        if definition is not None:
            resolved.append((cfg, definition))
    return resolved


def derive_task_status(submission_status: str | None, latest_decision: str | None) -> str:
    """Map a submission plus its latest review into one progress status."""
    if submission_status is None:
        return "not_started"
    if submission_status == "in_progress":
        return "draft"
    if submission_status == "completed" or latest_decision == "approved":
        return "approved"
    if submission_status == "escalated" or latest_decision == "escalated":
        return "escalated"
    if submission_status == "needs_review" or latest_decision == "needs_revision":
        return "needs_revision"
    if submission_status == "submitted":
        return "submitted"
    return "draft"


def is_overdue(status: str, due_at: datetime | None, now: datetime) -> bool:
    """True when a not-yet-approved task's due date has passed."""
    due = _as_utc(due_at)
    if due is None or status == "approved":
        return False
    return due < now


@dataclass
class SubmissionLike:
    task_id: str
    learner_id: str
    status: str
    updated_at: datetime | None = None


@dataclass
class ReviewLike:
    task_id: str
    learner_id: str
    decision: str
    created_at: datetime
    score: int | None = None
    reviewer_id: str | None = None
    submission_id: str | None = None


@dataclass
class LearnerProgress:
    tasks: list[dict] = field(default_factory=list)
    completion_rate: int = 0
    required_total: int = 0
    required_done: int = 0


def build_learner_progress(
    curriculum: list[tuple[ProgramTaskConfig, TaskDefinition]],
    submissions: list[SubmissionLike],
    reviews_by_task: dict[str, ReviewLike],
    now: datetime | None = None,
) -> LearnerProgress:
    """Combine curriculum, submissions, and reviews into one learner's progress."""
    reference = now or datetime.now(UTC)
    sub_by_task = {s.task_id: s for s in submissions}
    tasks: list[dict] = []
    for cfg, definition in curriculum:
        submission = sub_by_task.get(cfg.task_id)
        review = reviews_by_task.get(cfg.task_id)
        status = derive_task_status(submission.status if submission else None, review.decision if review else None)
        requires_review = (
            cfg.requires_review_override
            if cfg.requires_review_override is not None
            else definition.requires_review
        )
        tasks.append(
            {
                "taskId": cfg.task_id,
                "title": definition.title,
                "agent": definition.agent,
                "status": status,
                "required": cfg.required,
                "dueAt": _as_utc(cfg.due_at).isoformat() if cfg.due_at else None,
                "overdue": is_overdue(status, cfg.due_at, reference),
                "requiresReview": requires_review,
                "score": review.score if review else None,
            }
        )

    required = [t for t in tasks if t["required"]]
    required_done = len([t for t in required if t["status"] == "approved"])
    completion_rate = 0 if not required else round(required_done / len(required) * 100)
    return LearnerProgress(tasks, completion_rate, len(required), required_done)


def build_class_progress(
    curriculum: list[tuple[ProgramTaskConfig, TaskDefinition]],
    enrollments: list[dict],
    submissions: list[SubmissionLike],
    reviews: list[ReviewLike],
    now: datetime | None = None,
) -> list[dict]:
    """Build per-learner progress rows for all non-removed enrollments."""
    active = [e for e in enrollments if e.get("status") != "removed"]
    subs_by_learner: dict[str, list[SubmissionLike]] = {}
    for sub in submissions:
        subs_by_learner.setdefault(sub.learner_id, []).append(sub)

    latest_by_learner_task: dict[tuple[str, str], ReviewLike] = {}
    for review in reviews:
        key = (review.learner_id, review.task_id)
        existing = latest_by_learner_task.get(key)
        if existing is None or review.created_at > existing.created_at:
            latest_by_learner_task[key] = review

    rows: list[dict] = []
    for enrollment in active:
        learner_id = enrollment["learner_id"]
        reviews_by_task = {
            task_id: review
            for (lid, task_id), review in latest_by_learner_task.items()
            if lid == learner_id
        }
        progress = build_learner_progress(
            curriculum,
            subs_by_learner.get(learner_id, []),
            reviews_by_task,
            now,
        )
        rows.append(
            {
                "learnerId": learner_id,
                "displayName": enrollment.get("display_name"),
                "status": enrollment.get("status"),
                "tasks": progress.tasks,
                "completionRate": progress.completion_rate,
                "requiredTotal": progress.required_total,
                "requiredDone": progress.required_done,
            }
        )
    return rows
