"""Service-to-service identity verification.

The web container authenticates the browser with Auth.js, then forwards the
authenticated user id to the backend signed with the shared
``AGENT_SERVICE_TOKEN``. The backend never trusts an unsigned user id.
"""

import hashlib
import hmac
import time
from dataclasses import dataclass

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


async def require_identity(
    x_ischolar_user: str | None = Header(default=None),
    x_ischolar_timestamp: str | None = Header(default=None),
    x_ischolar_signature: str | None = Header(default=None),
) -> Identity:
    """FastAPI dependency enforcing a valid signed service identity."""
    if not (x_ischolar_user and x_ischolar_timestamp and x_ischolar_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MISSING_SERVICE_IDENTITY")

    try:
        timestamp = int(x_ischolar_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_SERVICE_TIMESTAMP") from exc

    if abs(int(time.time()) - timestamp) > SIGNATURE_WINDOW_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="STALE_SERVICE_SIGNATURE")

    expected = _signature(x_ischolar_user, x_ischolar_timestamp, get_settings().agent_service_token)
    if not hmac.compare_digest(expected, x_ischolar_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_SERVICE_SIGNATURE")

    return Identity(user_id=x_ischolar_user)
