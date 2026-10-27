"""Desktop login + bearer-token identity.

Token/HTTP-contract checks stay offline; login tests that read the ``users``
table go through the shared Postgres-backed ``client`` fixture (skipped when
Postgres is unreachable).
"""

from __future__ import annotations

import time

import bcrypt
import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.v1 import auth as auth_module
from app.core.config import get_settings
from app.core.security import _token_key, create_desktop_token, require_identity, verify_desktop_token
from app.main import app

# Offline client: token verification never touches the database.
http = TestClient(app)

PASSWORD = "TestPass1"
# bcryptjs (web) cost-12 hash; proves the two ecosystems verify the same hash.
BCRYPTJS_HASH = "$2a$12$WpiXtIMZv65xbJZEyLra9.3hEbsg8Aq/cAwm7XtQ2ip.uZHaUc85i"


@pytest.fixture(autouse=True)
def _clean_throttle():
    auth_module.reset_throttle()
    yield
    auth_module.reset_throttle()


# ── offline: token lifecycle + header contract ──────────────────────────────


def test_token_roundtrip_resolves_identity() -> None:
    token, ttl = create_desktop_token("11111111-2222-3333-4444-555555555555")
    assert ttl == get_settings().desktop_token_ttl_seconds
    identity = verify_desktop_token(token)
    assert identity.user_id == "11111111-2222-3333-4444-555555555555"


def test_me_accepts_bearer_token() -> None:
    token, _ = create_desktop_token("user-456")
    response = http.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["data"]["userId"] == "user-456"


def test_me_rejects_expired_token() -> None:
    now = int(time.time())
    expired = jwt.encode(
        {"sub": "user-789", "typ": "desktop_access", "iat": now - 7200, "exp": now - 60},
        _token_key(),
        algorithm="HS256",
    )
    response = http.get("/v1/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "EXPIRED_ACCESS_TOKEN"


def test_me_rejects_garbage_and_wrong_scheme() -> None:
    assert http.get("/v1/me", headers={"Authorization": "Bearer not.a.token"}).status_code == 401
    bad_scheme = http.get("/v1/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert bad_scheme.status_code == 401
    assert bad_scheme.json()["detail"] == "INVALID_AUTHORIZATION_SCHEME"


def test_me_rejects_token_signed_with_other_key() -> None:
    forged = jwt.encode(
        {"sub": "user-000", "typ": "desktop_access", "exp": int(time.time()) + 600},
        "attacker-key-that-is-long-enough-32b",
        algorithm="HS256",
    )
    response = http.get("/v1/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_ACCESS_TOKEN"


def test_service_signature_path_unchanged_when_no_authorization() -> None:
    # The web BFF keeps working: signature headers still resolve identity.
    import asyncio

    from app.core.security import sign_identity

    headers = sign_identity("user-789")
    identity = asyncio.run(
        require_identity(
            authorization=None,
            x_ischolar_user=headers["X-IScholar-User"],
            x_ischolar_timestamp=headers["X-IScholar-Timestamp"],
            x_ischolar_signature=headers["X-IScholar-Signature"],
        )
    )
    assert identity.user_id == "user-789"


def test_authorization_takes_precedence_over_signature_headers() -> None:
    # Documented ordering: a well-formed bearer token wins even when the web
    # BFF's signature headers are also present.
    import asyncio

    from app.core.security import sign_identity

    token, _ = create_desktop_token("bearer-user")
    headers = sign_identity("signature-user")
    identity = asyncio.run(
        require_identity(
            authorization=f"Bearer {token}",
            x_ischolar_user=headers["X-IScholar-User"],
            x_ischolar_timestamp=headers["X-IScholar-Timestamp"],
            x_ischolar_signature=headers["X-IScholar-Signature"],
        )
    )
    assert identity.user_id == "bearer-user"


def test_invalid_authorization_scheme_fails_closed_not_fallback() -> None:
    # A malformed Authorization header must reject loudly instead of silently
    # degrading to the signature path (fail closed on the ambiguous case).
    import asyncio

    from app.core.security import sign_identity

    headers = sign_identity("signature-user")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            require_identity(
                authorization="Basic dXNlcjpwYXNz",
                x_ischolar_user=headers["X-IScholar-User"],
                x_ischolar_timestamp=headers["X-IScholar-Timestamp"],
                x_ischolar_signature=headers["X-IScholar-Signature"],
            )
        )
    assert exc.value.status_code == 401
    assert exc.value.detail == "INVALID_AUTHORIZATION_SCHEME"


# ── offline: password verification helpers ──────────────────────────────────


def test_verify_password_matches_bcryptjs_hash() -> None:
    assert auth_module.verify_password(PASSWORD.encode(), BCRYPTJS_HASH) is True
    assert auth_module.verify_password(b"wrong-password", BCRYPTJS_HASH) is False


def test_verify_password_rejects_malformed_hash() -> None:
    assert auth_module.verify_password(PASSWORD.encode(), "not-a-bcrypt-hash") is False


def test_verify_password_truncates_long_passwords_like_bcryptjs() -> None:
    # bcryptjs and Python bcrypt both consume the first 72 bytes.
    stored = bcrypt.hashpw(b"x" * 72, bcrypt.gensalt(4)).decode()
    assert auth_module.verify_password(b"x" * 100, stored) is True


def test_throttle_window_expires() -> None:
    key = "127.0.0.1:window@ischolar.test"
    for _ in range(auth_module.MAX_ATTEMPTS):
        auth_module.record_failure(key)
    with pytest.raises(HTTPException) as exc:
        auth_module.check_throttle(key)
    assert exc.value.status_code == 429
    # Age the failures past the window; the budget refills over time.
    auth_module._failures[key] = type(auth_module._failures[key])(
        t - auth_module.WINDOW_SECONDS - 1 for t in auth_module._failures[key]
    )
    auth_module.check_throttle(key)


def test_check_throttle_never_creates_entries_for_clean_keys() -> None:
    # A defaultdict-style `self._failures[key]` would leak one entry per key
    # an attacker probes; clean keys must leave no state behind.
    auth_module.check_throttle("127.0.0.1:clean@ischolar.test")
    assert "127.0.0.1:clean@ischolar.test" not in auth_module._failures


def test_purge_forgets_keys_whole_window_lapsed() -> None:
    import time as time_module

    key = "127.0.0.1:lapsed@ischolar.test"
    auth_module.record_failure(key)
    assert key in auth_module._failures
    # Age the entry and force the purge clock past its interval.
    auth_module._failures[key] = type(auth_module._failures[key])(
        t - auth_module.WINDOW_SECONDS - 1 for t in auth_module._failures[key]
    )
    auth_module._last_purge = time_module.monotonic() - auth_module.PURGE_INTERVAL_SECONDS - 1
    auth_module.check_throttle("127.0.0.1:another@ischolar.test")
    assert key not in auth_module._failures


# ── online: login endpoint against the users table ──────────────────────────


async def _seed_user(db_session, email: str, password: str = PASSWORD, password_hash: str | None = None) -> str:
    """Insert (or overwrite) a credential user; returns its id."""
    from sqlalchemy import text

    hashed = password_hash or bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()
    row = (
        await db_session.execute(
            text(
                "INSERT INTO users (email, name, password_hash, role) VALUES (:email, :name, :hash, 'learner') "
                "ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash "
                "RETURNING id::text AS id"
            ),
            {"email": email, "name": "Desktop Tester", "hash": hashed},
        )
    ).first()
    return str(row.id)


async def test_login_rejects_unknown_email(client, db_session) -> None:
    response = await client.post("/v1/auth/login", json={"email": "nobody@ischolar.test", "password": PASSWORD})
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_CREDENTIALS"


async def test_login_rejects_wrong_password(client, db_session) -> None:
    await _seed_user(db_session, "wrongpw@ischolar.test")
    response = await client.post("/v1/auth/login", json={"email": "wrongpw@ischolar.test", "password": "nope-nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_CREDENTIALS"


async def test_login_requires_password(client, db_session) -> None:
    response = await client.post("/v1/auth/login", json={"email": "a@b.co"})
    assert response.status_code == 422


async def test_login_returns_bearer_token_for_valid_credentials(client, db_session) -> None:
    user_id = await _seed_user(db_session, "desktop-ok@ischolar.test", password_hash=BCRYPTJS_HASH)
    response = await client.post("/v1/auth/login", json={"email": "desktop-ok@ischolar.test", "password": PASSWORD})
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    data = payload["data"]
    assert data["tokenType"] == "Bearer"
    assert data["expiresIn"] == get_settings().desktop_token_ttl_seconds
    assert data["user"]["id"] == user_id
    # The issued token authenticates API calls without service headers.
    me = await client.get("/v1/me", headers={"Authorization": f"Bearer {data['accessToken']}"})
    assert me.status_code == 200
    assert me.json()["data"]["userId"] == user_id


async def test_login_is_case_insensitive_on_email(client, db_session) -> None:
    await _seed_user(db_session, "CaseMix@ischolar.test")
    response = await client.post("/v1/auth/login", json={"email": "casemix@ischolar.test", "password": PASSWORD})
    assert response.status_code == 200


async def test_login_throttles_after_repeated_failures(client, db_session) -> None:
    payload = {"email": "brute@ischolar.test", "password": "guess-1"}
    for _ in range(auth_module.MAX_ATTEMPTS):
        assert (await client.post("/v1/auth/login", json=payload)).status_code == 401
    assert (await client.post("/v1/auth/login", json=payload)).status_code == 429
    # A different account stays usable: the budget is keyed per IP + email.
    other = await client.post("/v1/auth/login", json={"email": "other@ischolar.test", "password": "guess-1"})
    assert other.status_code == 401
