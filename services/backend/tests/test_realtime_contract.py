"""Realtime NOTIFY/SSE contracts (no database required)."""

from __future__ import annotations

import json
import uuid

from fastapi.testclient import TestClient

from app.core.notify import event_payload
from app.main import app

client = TestClient(app)


def test_event_payload_includes_scope() -> None:
    project_id = uuid.uuid4()
    payload = json.loads(event_payload("audit.appended", {"id": "x"}, project_id=project_id))
    assert payload["kind"] == "audit.appended"
    assert payload["projectId"] == str(project_id)
    assert payload["data"] == {"id": "x"}
    assert "programId" not in payload


def test_event_payload_program_scope() -> None:
    payload = json.loads(event_payload("training.submission", program_id="prog-1"))
    assert payload["programId"] == "prog-1"
    assert "projectId" not in payload


def test_event_payload_is_bounded() -> None:
    payload = event_payload("huge", {"blob": "x" * 20_000}, project_id=uuid.uuid4())
    assert len(payload.encode()) <= 7900


def test_realtime_route_inventory() -> None:
    paths = set(app.openapi()["paths"].keys())
    assert {"/v1/realtime/projects/{project_id}", "/v1/realtime/training"} <= paths


def test_realtime_rejects_missing_identity() -> None:
    response = client.get(f"/v1/realtime/projects/{uuid.uuid4()}")
    assert response.status_code == 401


def test_training_stream_requires_program_ids() -> None:
    from app.core.security import sign_identity

    response = client.get("/v1/realtime/training", headers=sign_identity(str(uuid.uuid4())), params={"programIds": ""})
    assert response.status_code == 422
