"""Tamper-evident audit chain helpers (pure, DB-free).

Each audit row stores ``parent_hash`` (the previous row's ``chain_hash``) and
``chain_hash`` (SHA-256 over this row's canonical fields plus the parent). The
hash therefore covers the entire history, so mutating any row breaks every
subsequent link. ``verify_chain`` recomputes the chain in O(n).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models import AuditEntry


def _canonical(payload: dict[str, Any]) -> str:
    """Deterministic JSON encoding used for hashing."""
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def chain_payload(entry: AuditEntry) -> dict[str, Any]:
    """Extract the hashable view of an audit entry (empty string for nulls)."""
    return {
        "parentHash": entry.parent_hash or "",
        "projectId": str(entry.project_id),
        "ownerId": str(entry.owner_id),
        "agentRunId": str(entry.agent_run_id) if entry.agent_run_id else "",
        "actor": entry.actor or "",
        "action": entry.action,
        "promptHash": entry.prompt_hash or "",
        "inputHash": entry.input_hash or "",
        "outputHash": entry.output_hash or "",
        "consentId": entry.consent_id or "",
        "createdAt": entry.created_at.isoformat() if entry.created_at else "",
    }


def compute_chain_hash(entry: AuditEntry) -> str:
    """SHA-256 over the canonical entry payload (parent + fields + timestamp)."""
    return hashlib.sha256(_canonical(chain_payload(entry)).encode()).hexdigest()


def verify_chain(entries: Sequence[AuditEntry]) -> dict[str, Any]:
    """Walk entries in chronological order and report the first broken link."""
    for index, entry in enumerate(entries):
        expected_parent = entries[index - 1].chain_hash if index else None
        if entry.parent_hash != expected_parent:
            return {"valid": False, "brokenAt": str(entry.id), "totalEntries": len(entries)}
        if entry.chain_hash != compute_chain_hash(entry):
            return {"valid": False, "brokenAt": str(entry.id), "totalEntries": len(entries)}
    return {"valid": True, "brokenAt": None, "totalEntries": len(entries)}
