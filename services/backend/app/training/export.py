"""CSV / JSON export helpers (port of ``lib/training/export.ts``)."""

from __future__ import annotations

import json
from typing import Any


def to_csv(rows: list[dict[str, Any]]) -> str:
    """Serialize rows to CSV using the union of all keys as headers."""
    if not rows:
        return ""
    headers: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                headers.append(key)

    def escape(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            text = value
        elif isinstance(value, (dict, list)):
            text = json.dumps(value, ensure_ascii=False)
        else:
            text = str(value)
        if any(ch in text for ch in (",", '"', "\n", "\r")):
            return '"' + text.replace('"', '""') + '"'
        return text

    lines = [",".join(headers)]
    lines.extend(",".join(escape(row.get(h)) for h in headers) for row in rows)
    return "\n".join(lines)


def redact_email(email: str | None) -> str | None:
    """Partially mask a local part while keeping the domain."""
    if not email:
        return None
    if "@" not in email:
        return "***"
    user, domain = email.split("@", 1)
    safe_user = "*" * len(user) if len(user) <= 2 else f"{user[0]}***{user[-1]}"
    return f"{safe_user}@{domain}"


def redact_id(value: str | None) -> str | None:
    """Show only the first/last characters of an id, or fully mask short ids."""
    if not value:
        return None
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}…{value[-4:]}"
