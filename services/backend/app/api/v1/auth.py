"""Desktop credential login (POST /v1/auth/login).

The desktop client has no Auth.js session, so it exchanges email + password
for a short-lived bearer access token (see ``app.core.security``). Password
hashes are owned by the web container; this endpoint only *reads* the
``users`` table, mirroring ``deps.resolve_role``.

Brute-force throttling is in-process (uvicorn runs a single worker in
compose); it is keyed per client IP + email so one account cannot be locked
out by another host.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import create_desktop_token

router = APIRouter(prefix="/auth", tags=["auth"])

# Sliding window: rejected before any bcrypt work so a flood stays cheap.
MAX_ATTEMPTS = 10
WINDOW_SECONDS = 15 * 60
# Drop keys whose whole window expired at most this often (bounded memory).
PURGE_INTERVAL_SECONDS = 60.0

_failures: dict[str, deque[float]] = {}
_last_purge = 0.0
# Lazily built cost-12 dummy hash so unknown emails cost the same as a real
# password check (prevents user enumeration via response timing).
_dummy_hash: bytes | None = None


def throttle_key(request: Request, email: str) -> str:
    """Client IP + normalized email; missing IP still yields a usable key."""
    host = request.client.host if request.client else "unknown"
    return f"{host}:{email.strip().lower()}"


def _prune(window: deque[float], cutoff: float) -> bool:
    """Drop expired timestamps; returns True when the window is now empty."""
    while window and window[0] < cutoff:
        window.popleft()
    return not window


def _purge_expired(now: float) -> None:
    """Forget keys whose entire window lapsed (rate-limited to stay cheap)."""
    global _last_purge
    if now - _last_purge < PURGE_INTERVAL_SECONDS:
        return
    _last_purge = now
    cutoff = now - WINDOW_SECONDS
    for key in [k for k, w in _failures.items() if _prune(w, cutoff)]:
        _failures.pop(key, None)


def check_throttle(key: str) -> None:
    """Raise 429 when the key exhausted its failure budget."""
    now = time.monotonic()
    _purge_expired(now)
    window = _failures.get(key)  # .get: never create an entry for a clean key
    if not window:
        return
    _prune(window, now - WINDOW_SECONDS)
    if len(window) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="TOO_MANY_ATTEMPTS")


def record_failure(key: str) -> None:
    now = time.monotonic()
    window = _failures.setdefault(key, deque())
    window.append(now)
    _prune(window, now - WINDOW_SECONDS)


def clear_failures(key: str) -> None:
    _failures.pop(key, None)


def reset_throttle() -> None:
    """Test hook: drop all recorded failures."""
    global _last_purge
    _failures.clear()
    _last_purge = 0.0


def verify_password(password: bytes, stored_hash: str) -> bool:
    """Constant-false on malformed hashes; bcrypt truncates at 72 bytes."""
    try:
        return bcrypt.checkpw(password[:72], stored_hash.encode("utf-8"))
    except ValueError:
        return False


def _dummy_verify(password: bytes) -> None:
    """Run a real-cost comparison for unknown emails (timing parity)."""
    global _dummy_hash
    if _dummy_hash is None:
        # Cost 12 matches lib/auth/password.ts; built once, in a worker thread.
        _dummy_hash = bcrypt.hashpw(b"ischolar-timing-equalizer", bcrypt.gensalt(12))
    bcrypt.checkpw(password[:72], _dummy_hash)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


@router.post("/login")
async def login(body: LoginRequest, request: Request, session: AsyncSession = Depends(get_session)) -> dict:
    """Verify credentials and issue a desktop bearer access token."""
    key = throttle_key(request, body.email)
    check_throttle(key)

    row = (
        await session.execute(
            # `users.email` is citext UNIQUE; comparing the column directly keeps
            # case-insensitive semantics and can use the unique index (a
            # `lower(email) = ...` form could never, without an extra expression index).
            text("SELECT id::text AS id, email, name, password_hash, role FROM users WHERE email = :email"),
            {"email": body.email},
        )
    ).first()

    password = body.password.encode("utf-8")
    if row is None:
        # Spend the same bcrypt work as a real check to blur user existence.
        await asyncio.to_thread(_dummy_verify, password)
        record_failure(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_CREDENTIALS")

    valid = await asyncio.to_thread(verify_password, password, row.password_hash)
    if not valid:
        record_failure(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="INVALID_CREDENTIALS")

    clear_failures(key)
    token, expires_in = create_desktop_token(row.id)
    return {
        "ok": True,
        "data": {
            "accessToken": token,
            "tokenType": "Bearer",
            "expiresIn": expires_in,
            "user": {"id": row.id, "email": row.email, "name": row.name, "role": row.role},
        },
    }
