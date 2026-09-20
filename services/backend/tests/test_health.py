"""Liveness and service-identity tests (no database required)."""

from fastapi.testclient import TestClient

from app.core.security import sign_identity
from app.main import app

client = TestClient(app)


def test_healthz_ok() -> None:
    response = client.get("/v1/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_rejects_missing_identity() -> None:
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "MISSING_SERVICE_IDENTITY"


def test_me_accepts_signed_identity() -> None:
    headers = sign_identity("user-123")
    response = client.get("/v1/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["userId"] == "user-123"


def test_me_rejects_forged_signature() -> None:
    headers = sign_identity("user-123")
    headers["X-IScholar-Signature"] = "deadbeef"
    response = client.get("/v1/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_SERVICE_SIGNATURE"


def test_me_rejects_stale_signature() -> None:
    headers = sign_identity("user-123", timestamp=1)
    response = client.get("/v1/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "STALE_SERVICE_SIGNATURE"
