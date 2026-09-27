"""MCP guard parity tests (SSRF + size caps), no network."""

import pytest

from app.mcp import guards
from app.mcp.guards import (
    GuardError,
    assert_safe_https_url,
    check_body_size,
    guarded_get_json,
    is_blocked_host,
)


def test_blocks_private_hosts() -> None:
    assert is_blocked_host("localhost") is True
    assert is_blocked_host("127.0.0.1") is True
    assert is_blocked_host("10.0.0.5") is True
    assert is_blocked_host("192.168.1.1") is True
    assert is_blocked_host("172.16.0.1") is True
    assert is_blocked_host("169.254.169.254") is True
    assert is_blocked_host("metadata.google.internal") is True
    assert is_blocked_host("openlibrary.org") is False
    assert is_blocked_host("api.openalex.org") is False


def test_requires_https_and_safe_hosts() -> None:
    with pytest.raises(GuardError, match="https"):
        assert_safe_https_url("http://example.com")
    with pytest.raises(GuardError, match="Blocked"):
        assert_safe_https_url("https://localhost/x")
    with pytest.raises(GuardError, match="credentials"):
        assert_safe_https_url("https://user:pass@example.com")
    assert assert_safe_https_url("https://openlibrary.org/search.json") == "https://openlibrary.org/search.json"


def test_check_body_size() -> None:
    assert check_body_size(None, 100) is True
    assert check_body_size("not-a-number", 100) is True
    assert check_body_size("100", 100) is True
    assert check_body_size("101", 100) is False


class _FakeStream:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    async def __aenter__(self) -> "_FakeStream":
        return self

    async def __aexit__(self, *_: object) -> bool:
        return False

    def raise_for_status(self) -> None:
        return None

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


class _FakeClient:
    chunks: list[bytes] = []

    def __init__(self, *_: object, **__: object) -> None:
        pass

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *_: object) -> bool:
        return False

    def stream(self, *_: object, **__: object) -> _FakeStream:
        return _FakeStream(self.chunks)


@pytest.mark.asyncio
async def test_guarded_get_json_enforces_size_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeClient.chunks = [b"a" * (guards.MAX_RESPONSE_BYTES + 1)]
    monkeypatch.setattr(guards.httpx, "AsyncClient", _FakeClient)
    with pytest.raises(GuardError, match="too large"):
        await guarded_get_json("https://api.openalex.org/works")


@pytest.mark.asyncio
async def test_guarded_get_json_parses_small_body(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeClient.chunks = [b'{"results": []}']
    monkeypatch.setattr(guards.httpx, "AsyncClient", _FakeClient)
    assert await guarded_get_json("https://api.openalex.org/works") == {"results": []}
