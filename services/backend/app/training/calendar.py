"""Pure due-date / calendar helpers (port of ``lib/training/calendar.ts``)."""

from __future__ import annotations

import calendar as _calendar
from datetime import date, datetime
from typing import Any


def to_date_key(value: str) -> str:
    """Reduce an ISO timestamp to its ``YYYY-MM-DD`` date key."""
    return value[:10]


def build_month_grid(year: int, month: int, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build one day bucket per date in the given month, with events attached."""
    by_day: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        key = to_date_key(str(event["dueAt"]))
        by_day.setdefault(key, []).append(event)

    last_day = _calendar.monthrange(year, month)[1]
    days = []
    for day in range(1, last_day + 1):
        date_key = f"{year}-{month:02d}-{day:02d}"
        days.append({"date": date_key, "events": by_day.get(date_key, [])})
    return days


def _iso(value: date | datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return value.isoformat()


def collect_due_events(programs: list[dict[str, Any]], tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten program bounds and task due dates into a chronologically sorted event list."""
    events: list[dict[str, Any]] = []
    name_by_id = {p["id"]: p["name"] for p in programs}
    for program in programs:
        start = _iso(program.get("start_date"))
        end = _iso(program.get("end_date"))
        if start:
            events.append(
                {
                    "id": f"start-{program['id']}",
                    "programId": program["id"],
                    "programName": program["name"],
                    "taskId": "",
                    "dueAt": start,
                    "kind": "program_start",
                }
            )
        if end:
            events.append(
                {
                    "id": f"end-{program['id']}",
                    "programId": program["id"],
                    "programName": program["name"],
                    "taskId": "",
                    "dueAt": end,
                    "kind": "program_end",
                }
            )
    for task in tasks:
        due = _iso(task.get("due_at"))
        if not due:
            continue
        events.append(
            {
                "id": f"due-{task['program_id']}-{task['task_id']}",
                "programId": task["program_id"],
                "programName": name_by_id.get(task["program_id"]),
                "taskId": task["task_id"],
                "taskTitle": task.get("title"),
                "dueAt": due,
                "kind": "task_due",
            }
        )
    events.sort(key=lambda e: str(e["dueAt"]))
    return events
