"""Training completion certificate helpers (port of ``lib/training/certificate.ts``)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

DONE_STATUSES = {"approved", "completed"}


def assess_completion(required_task_ids: list[str], task_status: dict[str, str]) -> dict[str, Any]:
    """Compare required task ids against task statuses to decide eligibility."""
    completed_required = []
    missing_required = []
    for task_id in required_task_ids:
        status = task_status.get(task_id, "not_started")
        if status in DONE_STATUSES:
            completed_required.append(task_id)
        else:
            missing_required.append(task_id)
    return {
        "eligible": not missing_required and bool(required_task_ids),
        "missingRequired": missing_required,
        "completedRequired": completed_required,
        "requiredTaskIds": required_task_ids,
    }


def build_payload(
    program_id: str,
    program_name: str,
    learner_id: str,
    display_name: str | None,
    completed_task_ids: list[str],
    required_task_ids: list[str],
    completed_at: str | None = None,
    issuer: str = "iScholar",
) -> dict[str, Any]:
    """Assemble a canonical payload with sorted task ids."""
    return {
        "v": 1,
        "programId": program_id,
        "programName": program_name,
        "learnerId": learner_id,
        "displayName": display_name,
        "completedTaskIds": sorted(completed_task_ids),
        "requiredTaskIds": sorted(required_task_ids),
        "completedAt": completed_at or datetime.now(UTC).isoformat(),
        "issuer": issuer,
    }


def canonical_json(payload: dict[str, Any]) -> str:
    """Serialize a payload with a fixed key order for stable hashing."""
    ordered = {
        "v": payload["v"],
        "programId": payload["programId"],
        "programName": payload["programName"],
        "learnerId": payload["learnerId"],
        "displayName": payload["displayName"],
        "completedTaskIds": payload["completedTaskIds"],
        "requiredTaskIds": payload["requiredTaskIds"],
        "completedAt": payload["completedAt"],
        "issuer": payload["issuer"],
    }
    return json.dumps(ordered, separators=(",", ":"), ensure_ascii=False)


def hash_payload(payload: dict[str, Any]) -> str:
    """SHA-256 hex digest of the canonical payload JSON."""
    return hashlib.sha256(canonical_json(payload).encode()).hexdigest()


def verify_hash(payload: dict[str, Any], expected_hash: str) -> bool:
    """Recompute the payload hash and compare case-insensitively."""
    return hash_payload(payload) == expected_hash.lower()
