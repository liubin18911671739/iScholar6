"""LTI AGS port parity tests (offline, httpx.MockTransport)."""

from __future__ import annotations

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.training.lms_ags import (
    LmsLinkCredentials,
    build_client_assertion,
    content_hash_credentials,
    fetch_lti_access_token,
    mask_secret,
    push_gradebook_to_ags,
    scores_endpoint,
    to_ags_score_lines,
)

TOKEN_URL = "https://lms.example.edu/login/oauth2/token"
LINEITEM = "https://lms.example.edu/line_items/42"


def _credentials(**overrides: object) -> LmsLinkCredentials:
    base = {
        "platform": "canvas",
        "client_id": "client-1",
        "client_secret": "shhh",
        "token_url": TOKEN_URL,
        "ags_lineitem_url": LINEITEM,
        "auth_method": "client_secret_post",
    }
    base.update(overrides)
    return LmsLinkCredentials(**base)  # type: ignore[arg-type]


def test_build_client_assertion_hs256_roundtrip() -> None:
    assertion = build_client_assertion(client_id="client-1", token_url=TOKEN_URL, client_secret="shhh")
    claims = jwt.decode(assertion, "shhh", algorithms=["HS256"], audience=TOKEN_URL)
    assert claims["iss"] == "client-1"
    assert claims["sub"] == "client-1"


def test_build_client_assertion_rs256_roundtrip() -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    assertion = build_client_assertion(
        client_id="client-1", token_url=TOKEN_URL, private_key_pem=private_pem
    )
    assert jwt.decode(assertion, public_pem, algorithms=["RS256"], audience=TOKEN_URL)["iss"] == "client-1"


def test_build_client_assertion_requires_secret() -> None:
    with pytest.raises(ValueError, match="CLIENT_SECRET_REQUIRED"):
        build_client_assertion(client_id="client-1", token_url=TOKEN_URL)


def test_scores_endpoint_appends_once() -> None:
    assert scores_endpoint(LINEITEM) == f"{LINEITEM}/scores"
    assert scores_endpoint(f"{LINEITEM}/scores/") == f"{LINEITEM}/scores"


def test_to_ags_score_lines_maps_status() -> None:
    lines = to_ags_score_lines(
        [
            {"learnerId": "u1", "overall": 90, "status": "completed", "displayName": "Ada"},
            {"learnerId": "u2", "overall": None, "status": "active"},
        ]
    )
    assert lines[0]["activityProgress"] == "Completed"
    assert lines[0]["gradingProgress"] == "FullyGraded"
    assert lines[0]["scoreMaximum"] == 100
    assert lines[1]["gradingProgress"] == "Pending"


def test_mask_and_hash() -> None:
    assert mask_secret(None) is None
    assert mask_secret("abcd") == "****"
    assert mask_secret("abcdef") == "ab…ef"
    assert content_hash_credentials(client_id="c", token_url="t", ags_lineitem_url="l") == content_hash_credentials(
        client_id="c", token_url="t", ags_lineitem_url="l"
    )


def _client(handler) -> httpx.AsyncClient:  # type: ignore[no-untyped-def]
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_fetch_lti_access_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == TOKEN_URL
        return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})

    async with _client(handler) as client:
        token = await fetch_lti_access_token(_credentials(), client=client)
    assert token == {"accessToken": "tok", "expiresIn": 3600}


@pytest.mark.asyncio
async def test_fetch_lti_access_token_failure() -> None:
    async with _client(lambda _request: httpx.Response(401, text="bad")) as client:
        with pytest.raises(ValueError, match="TOKEN_FAILED:401"):
            await fetch_lti_access_token(_credentials(), client=client)


@pytest.mark.asyncio
async def test_push_gradebook_dry_run_skips_scores() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json={"access_token": "tok"})

    async with _client(handler) as client:
        result = await push_gradebook_to_ags(
            credentials=_credentials(),
            learners=[{"learnerId": "u1", "overall": 80, "status": "completed"}],
            client=client,
            dry_run=True,
        )
    assert result == {"ok": True, "pushed": 0, "failed": 0, "errors": [], "accessTokenObtained": True}
    assert calls == [TOKEN_URL]


@pytest.mark.asyncio
async def test_push_gradebook_pushes_scored_learners_only() -> None:
    score_posts: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_URL:
            return httpx.Response(200, json={"access_token": "tok"})
        import json

        score_posts.append(json.loads(request.content))
        return httpx.Response(204)

    async with _client(handler) as client:
        result = await push_gradebook_to_ags(
            credentials=_credentials(),
            learners=[
                {"learnerId": "u1", "overall": 80, "status": "completed"},
                {"learnerId": "u2", "overall": None, "status": "active"},
            ],
            user_id_map={"u1": "lms-1"},
            client=client,
        )
    assert result["ok"] is True
    assert result["pushed"] == 1
    assert result["failed"] == 0
    assert score_posts[0]["userId"] == "lms-1"
    assert score_posts[0]["scoreGiven"] == 80


@pytest.mark.asyncio
async def test_push_gradebook_collects_failures() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == TOKEN_URL:
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(500, text="kaboom")

    async with _client(handler) as client:
        result = await push_gradebook_to_ags(
            credentials=_credentials(),
            learners=[{"learnerId": "u1", "overall": 80, "status": "completed"}],
            client=client,
        )
    assert result["ok"] is False
    assert result["failed"] == 1
    assert "SCORE_FAILED:500" in result["errors"][0]["error"]


@pytest.mark.asyncio
async def test_push_gradebook_token_failure() -> None:
    async with _client(lambda _request: httpx.Response(500, text="down")) as client:
        result = await push_gradebook_to_ags(
            credentials=_credentials(),
            learners=[{"learnerId": "u1", "overall": 80}],
            client=client,
        )
    assert result["ok"] is False
    assert result["accessTokenObtained"] is False
    assert result["errors"][0]["userId"] == "*"
