"""Identity verification for service and desktop callers.

Two caller classes authenticate to the backend, and neither ever holds the
other's credentials:

- The **web container** authenticates the browser with Auth.js, then forwards
  the authenticated user id signed with the shared ``AGENT_SERVICE_TOKEN``
  (``X-IScholar-*`` headers). The backend never trusts an unsigned user id.
- The **desktop client** has no Auth.js session, so it exchanges email +
  password for a short-lived JWT bearer access token (``POST /v1/auth/login``)
  and sends it via ``Authorization: Bearer``. The signing key is derived from
  ``AGENT_SERVICE_TOKEN`` and never leaves the server.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from app.core.config import get_settings

# Forwarded signatures older/newer than this are rejected (clock-skew tolerant).
SIGNATURE_WINDOW_SECONDS = 300


@dataclass(frozen=True)
class Identity:
    """Authenticated caller identity resolved from a verified service signature."""

    user_id: str


def _signature(user_id: str, timestamp: str, secret: str) -> str:
    message = f"{user_id}:{timestamp}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def sign_identity(user_id: str, timestamp: int | None = None) -> dict[str, str]:
    """Build signed headers for a user id. Used by the web BFF and tests."""
    ts = str(timestamp if timestamp is not None else int(time.time()))
    secret = get_settings().agent_service_token
    return {
        "X-IScholar-User": user_id,
        "X-IScholar-Timestamp": ts,
        "X-IScholar-Signature": _signature(user_id, ts, secret),
    }


def _token_key() -> bytes:
    """Derive the desktop JWT key from the service token (server-side only)."""
    secret = get_settings().agent_service_token
    return hmac.new(secret.encode(), b"ischolar-desktop-access-token", hashlib.sha256).digest()


def create_desktop_token(user_id: str) -> tuple[str, int]:
    """Issue a short-lived bearer access token for the desktop client.

    Returns ``(token, expires_in_seconds)``. The token carries no role or
    privileges: authorization keeps resolving the role from the database per
    request, exactly like the forwarded service identity.
    """
    ttl = get_settings().desktop_token_ttl_seconds
    now = int(time.time())
    payload = {"sub": user_id, "typ": "desktop_access", "iat": now, "exp": now + ttl}
    return jwt.encode(payload, _token_key(), algorithm="HS256"), ttl


def verify_desktop_token(token: str) -> Identity:
    """Decode a desktop bearer token, raising 401 on any invalid token."""
    try:
        payload = jwt.decode(token, _token_key(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="EXPIRED_ACCESS_TOKEN") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_ACCESS_TOKEN") from exc
    user_id = payload.get("sub")
    if payload.get("typ") != "desktop_access" or not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_ACCESS_TOKEN")
    return Identity(user_id=user_id)


async def require_identity(
    authorization: str | None = Header(default=None),
    x_ischolar_user: str | None = Header(default=None),
    x_ischolar_timestamp: str | None = Header(default=None),
    x_ischolar_signature: str | None = Header(default=None),
) -> Identity:
    """FastAPI dependency enforcing a verified caller identity.

    Accepts either a desktop ``Authorization: Bearer`` access token or the
    web BFF's ``X-IScholar-*`` service signature headers; both resolve to the
    same identity shape.
    """
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token.strip():
            return verify_desktop_token(token.strip())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_AUTHORIZATION_SCHEME")

    if not (x_ischolar_user and x_ischolar_timestamp and x_ischolar_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MISSING_SERVICE_IDENTITY")

    try:
        timestamp = int(x_ischolar_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_SERVICE_TIMESTAMP") from exc

    if abs(int(time.time()) - timestamp) > SIGNATURE_WINDOW_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="STALE_SERVICE_SIGNATURE")

    expected = _signature(x_ischolar_user, x_ischolar_timestamp, get_settings().agent_service_token)
    # Compare bytes: `hmac.compare_digest` raises TypeError on non-ASCII str input.
    provided = x_ischolar_signature.encode("utf-8", "ignore")
    if not hmac.compare_digest(expected.encode("ascii"), provided):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_SERVICE_SIGNATURE")

    return Identity(user_id=x_ischolar_user)
