"""LTI Advantage Assignment and Grade Services (AGS) helpers.

Python port of ``lib/lms/lti/ags.ts``. Builds OAuth2 client-assertion JWTs
(HS256 with the client secret or RS256 with a private key), fetches an LTI
access token, and POSTs a whole gradebook to a line item's ``/scores`` endpoint.

All network calls go through ``httpx.AsyncClient`` and accept an injected client
so tests can run offline.
"""

from __future__ import annotations

import base64
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt

from app.mcp.guards import GuardError, assert_safe_https_url

TOKEN_SCOPES = [
    "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
]


@dataclass(slots=True)
class LmsLinkCredentials:
    """Stored credentials/config for one LMS link."""

    client_id: str
    token_url: str
    ags_lineitem_url: str
    platform: str = "generic"
    client_secret: str | None = None
    auth_method: str = "client_secret_post"
    private_key_pem: str | None = None
    issuer: str | None = None


def build_client_assertion(
    *,
    client_id: str,
    token_url: str,
    client_secret: str | None = None,
    private_key_pem: str | None = None,
    now: datetime | None = None,
    expires_in_sec: int = 300,
) -> str:
    """Build an OAuth2 ``client_assertion`` JWT (HS256 secret or RS256 private key)."""
    issued = now or datetime.now(UTC)
    if issued.tzinfo is None:
        issued = issued.replace(tzinfo=UTC)
    payload = {
        "iss": client_id,
        "sub": client_id,
        "aud": token_url,
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=expires_in_sec)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    if private_key_pem:
        return jwt.encode(payload, private_key_pem, algorithm="RS256")
    if not client_secret:
        raise ValueError("CLIENT_SECRET_REQUIRED")
    return jwt.encode(payload, client_secret, algorithm="HS256")


async def fetch_lti_access_token(
    creds: LmsLinkCredentials,
    scopes: list[str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Obtain an OAuth2 access token from the platform token endpoint."""
    method = creds.auth_method or "client_secret_post"
    form: dict[str, str] = {
        "grant_type": "client_credentials",
        "scope": " ".join(scopes if scopes is not None else TOKEN_SCOPES),
    }
    headers: dict[str, str] = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }

    if method in {"private_key_jwt", "client_secret_post"}:
        if method == "private_key_jwt" or creds.private_key_pem:
            form["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
            form["client_assertion"] = build_client_assertion(
                client_id=creds.client_id,
                token_url=creds.token_url,
                client_secret=creds.client_secret,
                private_key_pem=creds.private_key_pem,
            )
        else:
            form["client_id"] = creds.client_id
            form["client_secret"] = creds.client_secret or ""
    elif method == "client_secret_basic":
        token = f"{creds.client_id}:{creds.client_secret or ''}".encode()
        headers["Authorization"] = f"Basic {base64.b64encode(token).decode()}"

    owns_client = client is None
    client = client or httpx.AsyncClient()
    try:
        assert_safe_https_url(creds.token_url)
        response = await client.post(creds.token_url, data=form, headers=headers)
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code >= 400:
        raise ValueError(f"TOKEN_FAILED:{response.status_code}:{response.text[:200]}")
    payload = response.json()
    if not payload.get("access_token"):
        raise ValueError("TOKEN_MISSING")
    return {"accessToken": payload["access_token"], "expiresIn": payload.get("expires_in")}


def scores_endpoint(lineitem_url: str) -> str:
    """Append ``/scores`` to a line-item URL when not already present."""
    base = lineitem_url.rstrip("/")
    return base if base.endswith("/scores") else f"{base}/scores"


async def post_ags_score(
    *,
    scores_url: str,
    access_token: str,
    user_id: str,
    score_given: float | None,
    score_maximum: float = 100,
    activity_progress: str = "Completed",
    grading_progress: str = "FullyGraded",
    comment: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> None:
    """POST a single AGS score to a line-item ``/scores`` endpoint."""
    body = {
        "userId": user_id,
        "scoreGiven": score_given,
        "scoreMaximum": score_maximum,
        "activityProgress": activity_progress,
        "gradingProgress": grading_progress,
        "timestamp": datetime.now(UTC).isoformat(),
        "comment": comment,
    }
    owns_client = client is None
    client = client or httpx.AsyncClient()
    try:
        response = await client.post(
            scores_url,
            json=body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/vnd.ims.lis.v1.score+json",
                "Accept": "application/json",
            },
        )
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code >= 400:
        raise ValueError(f"SCORE_FAILED:{response.status_code}:{response.text[:200]}")


def to_ags_score_lines(learners: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map gradebook learners to AGS score lines (skipping null overall scores)."""
    return [
        {
            "userId": row["learnerId"],
            "scoreGiven": row.get("overall"),
            "scoreMaximum": 100,
            "activityProgress": "Completed" if row.get("status") == "completed" else "InProgress",
            "gradingProgress": "FullyGraded" if row.get("overall") is not None else "Pending",
            "comment": f"iScholar grade for {row['displayName']}" if row.get("displayName") else None,
        }
        for row in learners
    ]


async def push_gradebook_to_ags(
    *,
    credentials: LmsLinkCredentials,
    learners: list[dict[str, Any]],
    user_id_map: dict[str, str] | None = None,
    client: httpx.AsyncClient | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Push overall grades for a camp to the configured AGS line item."""
    result: dict[str, Any] = {
        "ok": True,
        "pushed": 0,
        "failed": 0,
        "errors": [],
        "accessTokenObtained": False,
    }

    try:
        token = await fetch_lti_access_token(credentials, client=client)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as an error entry
        result["ok"] = False
        result["errors"].append({"userId": "*", "error": str(exc)})
        return result

    result["accessTokenObtained"] = True
    if dry_run:
        return result

    endpoint = scores_endpoint(credentials.ags_lineitem_url)
    try:
        assert_safe_https_url(endpoint)
    except GuardError as exc:
        result["ok"] = False
        result["errors"].append({"userId": "*", "error": str(exc)})
        return result
    for line in to_ags_score_lines(learners):
        if line["scoreGiven"] is None:
            continue
        platform_user_id = (user_id_map or {}).get(line["userId"], line["userId"])
        try:
            await post_ags_score(
                scores_url=endpoint,
                access_token=token["accessToken"],
                user_id=platform_user_id,
                score_given=line["scoreGiven"],
                score_maximum=line["scoreMaximum"],
                activity_progress=line["activityProgress"],
                grading_progress=line["gradingProgress"],
                comment=line["comment"],
                client=client,
            )
            result["pushed"] += 1
        except Exception as exc:  # noqa: BLE001 - collect per-user failures
            result["failed"] += 1
            result["errors"].append({"userId": platform_user_id, "error": str(exc)})

    result["ok"] = result["failed"] == 0
    return result


def mask_secret(value: str | None) -> str | None:
    """Mask a secret for API responses."""
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return f"{value[:2]}…{value[-2:]}"


def content_hash_credentials(
    *, client_id: str | None = None, token_url: str | None = None, ags_lineitem_url: str | None = None
) -> str:
    """Fingerprint the client id/token URL/line-item triple for change detection."""
    raw = f"{client_id or ''}|{token_url or ''}|{ags_lineitem_url or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]
