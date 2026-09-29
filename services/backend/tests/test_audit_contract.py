"""Consent + hash-chain audit contracts (no database required)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.api.v1.audit import AuditCreate, ConsentCreate
from app.core.audit import compute_chain_hash, verify_chain
from app.core.security import sign_identity
from app.main import app
from app.models import AuditEntry

client = TestClient(app)

PROJECT_ID = uuid.uuid4()
OWNER_ID = uuid.uuid4()
BASE_TIME = datetime(2026, 9, 28, 12, 0, 0, tzinfo=UTC)


def _entry(action: str, *, parent: str | None, offset: int) -> AuditEntry:
    entry = AuditEntry(
        id=uuid.uuid4(),
        project_id=PROJECT_ID,
        owner_id=OWNER_ID,
        action=action,
        parent_hash=parent,
        created_at=BASE_TIME + timedelta(seconds=offset),
    )
    entry.chain_hash = compute_chain_hash(entry)
    return entry


def test_chain_verifies_in_order() -> None:
    first = _entry("agent.run", parent=None, offset=0)
    second = _entry("agent.approved", parent=first.chain_hash, offset=1)
    assert verify_chain([first, second]) == {"valid": True, "brokenAt": None, "totalEntries": 2}


def test_chain_detects_tampered_row() -> None:
    first = _entry("agent.run", parent=None, offset=0)
    second = _entry("agent.approved", parent=first.chain_hash, offset=1)
    second.action = "agent.deleted"
    result = verify_chain([first, second])
    assert result["valid"] is False
    assert result["brokenAt"] == str(second.id)


def test_chain_detects_broken_link() -> None:
    first = _entry("agent.run", parent=None, offset=0)
    second = _entry("agent.approved", parent="deadbeef", offset=1)
    result = verify_chain([first, second])
    assert result["valid"] is False
    assert result["brokenAt"] == str(second.id)


def test_audit_create_aliases() -> None:
    body = AuditCreate.model_validate({"projectId": str(PROJECT_ID), "action": "agent.run", "outputHash": "abc"})
    assert body.project_id == PROJECT_ID
    assert body.output_hash == "abc"


def test_consent_create_aliases() -> None:
    body = ConsentCreate.model_validate(
        {
            "projectId": str(PROJECT_ID),
            "purpose": "training_submit",
            "programId": str(uuid.uuid4()),
            "externalServices": ["camp_audit"],
            "dataCategories": ["reflection"],
        }
    )
    assert body.program_id is not None
    assert body.external_services == ["camp_audit"]


def test_audit_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    assert {
        "/v1/audit",
        "/v1/audit/consents",
        "/v1/audit/{project_id}",
        "/v1/audit/{project_id}/verify",
    } <= paths


def test_audit_rejects_missing_identity() -> None:
    response = client.get(f"/v1/audit/{PROJECT_ID}")
    assert response.status_code == 401
    assert response.json()["detail"] == "MISSING_SERVICE_IDENTITY"


def test_consent_rejects_missing_identity() -> None:
    response = client.post("/v1/audit/consents", json={})
    assert response.status_code == 401


def test_signed_identity_accepted_before_validation() -> None:
    headers = sign_identity(str(OWNER_ID))
    response = client.post("/v1/audit", headers=headers, json={"action": ""})
    assert response.status_code == 422
