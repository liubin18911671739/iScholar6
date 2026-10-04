"""LMS gradebook row helpers (port of ``lib/lms/gradebook.ts``).

Builds Canvas/Moodle/generic CSV rows and AGS-shaped score objects. Actual LTI
OAuth/passback lives in ``app/training/lms_ags.py``.
"""

from __future__ import annotations

from typing import Any


def to_unit_score(overall: float | None) -> float | None:
    """Map a 0–100 overall score to 0–1 (Canvas points_possible=1 style)."""
    if overall is None:
        return None
    return max(0.0, min(1.0, overall / 100))


def build_lms_gradebook_rows(
    learners: list[dict[str, Any]],
    fmt: str,
    *,
    course_name: str | None = None,
    section: str | None = None,
) -> list[dict[str, Any]]:
    """Build LMS import rows for the requested format."""
    if fmt == "canvas":
        rows = []
        for row in learners:
            unit = to_unit_score(row.get("overall"))
            rows.append(
                {
                    "Student": row.get("displayName") or "",
                    "ID": row["learnerId"],
                    "SIS User ID": "",
                    "SIS Login ID": row.get("email") or "",
                    "Section": section or course_name or "",
                    "Overall": row.get("overall") if row.get("overall") is not None else "",
                    "Overall (0-1)": unit if unit is not None else "",
                    "Status": row.get("status"),
                }
            )
        return rows

    if fmt == "moodle":
        rows = []
        for row in learners:
            name = (row.get("displayName") or "").strip()
            parts = name.split() if name else []
            first = parts[0] if parts else ""
            last = " ".join(parts[1:]) if len(parts) > 1 else ""
            rows.append(
                {
                    "First name": first,
                    "Last name": last,
                    "Email address": row.get("email") or "",
                    "ID number": row["learnerId"],
                    "Overall grade": row.get("overall") if row.get("overall") is not None else "",
                    "Status": row.get("status"),
                }
            )
        return rows

    rows = []
    for row in learners:
        base: dict[str, Any] = {
            "learner_id": row["learnerId"],
            "display_name": row.get("displayName"),
            "email": row.get("email"),
            "overall": row.get("overall"),
            "status": row.get("status"),
            "completed_at": row.get("completedAt"),
        }
        for task_id, score in (row.get("taskScores") or {}).items():
            base[f"score_{task_id}"] = score
        rows.append(base)
    return rows


def to_ags_score_lines(
    learners: list[dict[str, Any]], line_item_id: str = "urn:ischolar:overall"
) -> list[dict[str, Any]]:
    """AGS-like score objects (for import/integration wiring)."""
    lines = []
    for row in learners:
        overall = row.get("overall")
        lines.append(
            {
                "userId": row["learnerId"],
                "scoreGiven": overall,
                "scoreMaximum": 100,
                "activityProgress": "Completed" if row.get("status") == "completed" else "InProgress",
                "gradingProgress": "FullyGraded" if overall is not None else "Pending",
                "comment": f"iScholar grade for {row['displayName']}" if row.get("displayName") else None,
                "lineItemId": line_item_id,
            }
        )
    return lines
