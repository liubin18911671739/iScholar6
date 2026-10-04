"""Cross-program / semester reporting (port of ``lib/training/reporting-v2.ts``).

Pure aggregation over ``build_class_report`` outputs; no data fetching.
"""

from __future__ import annotations

import re
from typing import Any


def _avg(nums: list[float]) -> float:
    if not nums:
        return 0
    return round(sum(nums) / len(nums) * 10) / 10


def to_cross_program_row(snapshot: dict[str, Any]) -> dict[str, Any]:
    report = snapshot["report"]
    rates = [task["submitRate"] for task in report["byTask"]]
    approves = [task["approveRate"] for task in report["byTask"]]
    return {
        "programId": snapshot["programId"],
        "name": snapshot["name"],
        "status": snapshot.get("status"),
        "cohortName": snapshot.get("cohortName"),
        "memberCount": report["activeCount"],
        "avgCompletionRate": report["avgCompletionRate"],
        "pendingReviews": report["reviewLoad"]["pending"],
        "avgWaitHours": report["reviewLoad"]["avgWaitHours"],
        "riskCount": len(report["risk"]),
        "submitRateAvg": _avg(rates),
        "approveRateAvg": _avg(approves),
    }


def build_semester_dashboard(
    *,
    from_date: str,
    to_date: str,
    snapshots: list[dict[str, Any]],
    reviews: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    programs = [to_cross_program_row(snapshot) for snapshot in snapshots]
    members = sum(program["memberCount"] for program in programs)
    pending = sum(program["pendingReviews"] for program in programs)
    completion = _avg([program["avgCompletionRate"] for program in programs])

    by_reviewer: dict[str, dict[str, Any]] = {}
    for review in reviews or []:
        row = by_reviewer.setdefault(
            review["reviewer_id"],
            {"count": 0, "approved": 0, "needsRevision": 0, "escalated": 0, "scores": []},
        )
        row["count"] += 1
        if review["decision"] == "approved":
            row["approved"] += 1
        if review["decision"] == "needs_revision":
            row["needsRevision"] += 1
        if review["decision"] == "escalated":
            row["escalated"] += 1
        if isinstance(review.get("score"), (int, float)):
            row["scores"].append(review["score"])

    reviewer_kpis = [
        {
            "reviewerId": reviewer_id,
            "reviewCount": row["count"],
            "approved": row["approved"],
            "needsRevision": row["needsRevision"],
            "escalated": row["escalated"],
            "avgScore": _avg(row["scores"]) if row["scores"] else None,
        }
        for reviewer_id, row in by_reviewer.items()
    ]
    reviewer_kpis.sort(key=lambda kpi: kpi["reviewCount"], reverse=True)

    return {
        "window": {"from": from_date, "to": to_date},
        "programs": programs,
        "totals": {
            "programs": len(programs),
            "members": members,
            "pendingReviews": pending,
            "avgCompletionRate": completion,
        },
        "reviewerKpis": reviewer_kpis,
    }


def score_risk_cell(
    *,
    revision_count: int,
    escalated_count: int,
    sensitive_hits: int = 0,
    similarity_hint: float = 0.0,
    overdue: bool = False,
) -> dict[str, Any]:
    """Explainable risk score (0–100) with reasons; not a plagiarism verdict."""
    score = 0
    reasons: list[str] = []
    if revision_count >= 2:
        score += 40
        reasons.append(f"revisions:{revision_count}")
    elif revision_count == 1:
        score += 15
        reasons.append("revisions:1")
    if escalated_count > 0:
        score += 35
        reasons.append(f"escalated:{escalated_count}")
    if sensitive_hits > 0:
        score += 20
        reasons.append(f"sensitive:{sensitive_hits}")
    if similarity_hint >= 0.85:
        score += 25
        reasons.append(f"similarity:{round(similarity_hint * 100)}")
    if overdue:
        score += 15
        reasons.append("overdue")
    return {"score": min(100, score), "reasons": reasons}


def build_risk_heatmap(
    *,
    learners: list[dict[str, Any]],
    task_ids: list[str],
    cells: list[dict[str, Any]],
) -> dict[str, Any]:
    name_by_id = {learner["learnerId"]: learner.get("displayName") for learner in learners}
    scored_cells = []
    for cell in cells:
        scored = score_risk_cell(
            revision_count=cell["revisionCount"],
            escalated_count=cell["escalatedCount"],
            sensitive_hits=cell.get("sensitiveHits", 0),
            overdue=cell.get("overdue", False),
        )
        scored_cells.append(
            {
                "learnerId": cell["learnerId"],
                "displayName": name_by_id.get(cell["learnerId"]),
                "taskId": cell["taskId"],
                "score": scored["score"],
                "reasons": scored["reasons"],
            }
        )
    return {"learners": learners, "taskIds": task_ids, "cells": scored_cells}


def merge_review_load(loads: list[dict[str, Any]]) -> dict[str, Any]:
    pending = sum(load["pending"] for load in loads)
    waits = [load["avgWaitHours"] for load in loads if load.get("avgWaitHours") is not None]
    by_reviewer: dict[str, int] = {}
    for load in loads:
        for row in load["byReviewer"]:
            by_reviewer[row["reviewerId"]] = by_reviewer.get(row["reviewerId"], 0) + row["count"]
    return {
        "pending": pending,
        "avgWaitHours": _avg(waits) if waits else None,
        "byReviewer": [{"reviewerId": rid, "count": count} for rid, count in by_reviewer.items()],
    }


def text_similarity_hint(a: str, b: str) -> float:
    """Token Jaccard similarity (0–1); heuristic only."""

    def tokens(text: str) -> set[str]:
        cleaned = re.sub(r"[^a-z0-9\u4e00-\u9fff\s]+", " ", text.lower())
        return {word for word in cleaned.split() if len(word) > 2}

    left = tokens(a)
    right = tokens(b)
    if not left or not right:
        return 0.0
    inter = len(left & right)
    return inter / (len(left) + len(right) - inter)
