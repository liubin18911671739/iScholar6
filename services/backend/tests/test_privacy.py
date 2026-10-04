"""Sensitive-content detection/masking parity (pure, no DB)."""

from __future__ import annotations

from app.privacy.sensitive_content import (
    contains_sensitive_content,
    detect_sensitive_content,
    join_text_fields,
    mask_sensitive_content,
    mask_sensitive_fields,
    sensitive_scan_for_audit,
    summarize_sensitive_matches,
)


def _categories(value: str) -> set[str]:
    return {match.category for match in detect_sensitive_content(value)}


def test_detects_each_category() -> None:
    assert _categories("call 13800138000") == {"phone"}
    assert _categories("mail me at jane.doe@example.com") == {"email"}
    # A national id can embed a phone-like substring (parity with the TS regexes).
    assert "national_id" in _categories("id 11010119900101123X")
    assert _categories("学号: abc12345") == {"student_id"}
    assert _categories("student id: s-90001") == {"student_id"}


def test_contains_sensitive_content() -> None:
    assert contains_sensitive_content("联系人 13912345678") is True
    assert contains_sensitive_content("a plain research sentence") is False


def test_mask_replaces_spans_with_tokens() -> None:
    result = mask_sensitive_content("email a@b.com and phone 13800138000")
    assert result["applied"] == 2
    assert "[EMAIL]" in result["text"]
    assert "[PHONE]" in result["text"]
    assert result["changed"] is True
    assert result["text"].count("[") == 2


def test_mask_drops_overlapping_spans_keeping_leftmost() -> None:
    # The student-id pattern spans from the label and contains the phone digits.
    result = mask_sensitive_content("学号: 13800138000")
    assert result["applied"] == 1
    assert result["summary"]["byCategory"] == {"student_id": 1}


def test_mask_sensitive_fields_aggregates() -> None:
    result = mask_sensitive_fields({"note": "13800138000", "email": "a@b.com"})
    assert result["applied"] == 2
    assert result["changed"] is True
    assert result["fields"]["note"] == "[PHONE]"


def test_audit_summary_is_counts_only() -> None:
    matches = detect_sensitive_content("a@b.com and 13800138000 and 13900139000")
    summary = summarize_sensitive_matches(matches)
    assert summary == {"total": 3, "byCategory": {"email": 1, "phone": 2}}
    assert "a@b.com" not in str(summary)
    assert sensitive_scan_for_audit("no pii here") == {"total": 0, "byCategory": {}}


def test_join_text_fields() -> None:
    assert join_text_fields({"a": "x", "b": None, "c": 3}) == "x\n\n3"
