"""Sensitive-content detection and masking (port of ``lib/privacy/sensitive-content.ts``).

Detects PII categories (phone, email, national id, student id) in free text and
masks detected spans with placeholder tokens. Audit helpers expose counts only
and never raw matched values.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SENSITIVE_MASK_TOKENS: dict[str, str] = {
    "phone": "[PHONE]",
    "email": "[EMAIL]",
    "national_id": "[NATIONAL_ID]",
    "student_id": "[STUDENT_ID]",
}

# Category → detection regex. Mirrors the TypeScript patterns (case-insensitive
# where the TS source used `/i`).
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("phone", re.compile(r"(?:\+?86[- ]?)?1[3-9]\d{9}")),
    ("email", re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)),
    ("national_id", re.compile(r"\b\d{17}[\dXx]\b")),
    ("student_id", re.compile(r"(?:学号|student\s*id)\s*[:：]?\s*[A-Za-z0-9-]{5,}", re.IGNORECASE)),
)


@dataclass(frozen=True)
class SensitiveMatch:
    """A detected sensitive substring with its category, position, and length."""

    category: str
    index: int
    length: int
    # Original matched substring (preview only — do not log to remote).
    value: str


def detect_sensitive_content(value: str) -> list[SensitiveMatch]:
    """Detect all sensitive matches across categories, sorted by position."""
    matches: list[SensitiveMatch] = []
    for category, pattern in _PATTERNS:
        for match in pattern.finditer(value):
            matches.append(SensitiveMatch(category, match.start(), len(match.group(0)), match.group(0)))
    matches.sort(key=lambda item: item.index)
    return matches


def contains_sensitive_content(value: str) -> bool:
    """True when the text contains at least one sensitive match."""
    return bool(detect_sensitive_content(value))


def summarize_sensitive_matches(matches: list[SensitiveMatch]) -> dict:
    """Aggregate matches into total and per-category counts (no raw values)."""
    by_category: dict[str, int] = {}
    for match in matches:
        by_category[match.category] = by_category.get(match.category, 0) + 1
    return {"total": len(matches), "byCategory": by_category}


def mask_sensitive_content(value: str, tokens: dict[str, str] | None = None) -> dict:
    """Replace detected spans with category tokens.

    Processes matches right-to-left so indices stay valid; overlapping matches
    keep the earlier (leftmost) span.
    """
    token_map = tokens or SENSITIVE_MASK_TOKENS
    non_overlap: list[SensitiveMatch] = []
    cursor = -1
    for match in detect_sensitive_content(value):
        if match.index < cursor:
            continue
        non_overlap.append(match)
        cursor = match.index + match.length

    text = value
    for match in reversed(non_overlap):
        token = token_map.get(match.category, "[REDACTED]")
        text = text[: match.index] + token + text[match.index + match.length :]

    return {
        "text": text,
        "applied": len(non_overlap),
        "matches": non_overlap,
        "summary": summarize_sensitive_matches(non_overlap),
        "changed": bool(non_overlap),
    }


def mask_sensitive_fields(fields: dict[str, str], tokens: dict[str, str] | None = None) -> dict:
    """Apply one-click masking to every string field in a record."""
    applied = 0
    by_category: dict[str, int] = {}
    masked: dict[str, str] = {}
    for key, value in fields.items():
        result = mask_sensitive_content(value, tokens)
        masked[key] = result["text"]
        applied += result["applied"]
        for category, count in result["summary"]["byCategory"].items():
            by_category[category] = by_category.get(category, 0) + count
    return {
        "fields": masked,
        "applied": applied,
        "changed": applied > 0,
        "summary": {"total": applied, "byCategory": by_category},
    }


def join_text_fields(fields: dict) -> str:
    """Join all values for scanning multi-field forms."""
    return "\n".join("" if value is None else str(value) for value in fields.values())


def sensitive_scan_for_audit(value: str) -> dict:
    """Counts-only scan summary (no raw matched values)."""
    return summarize_sensitive_matches(detect_sensitive_content(value))
