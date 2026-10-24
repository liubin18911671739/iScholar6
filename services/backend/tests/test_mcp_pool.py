"""Remote MCP pool: namespaced discovery, caching, and call routing."""

from __future__ import annotations

from typing import Any

import pytest

import app.mcp.pool as pool_module
from app.mcp.pool import MCPClientPool, MCPServerConfig, discover_remote_tools


@pytest.mark.asyncio
async def test_discover_namespaces_by_server(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_session_call(url: str, action: str, tool: str = "", arguments: dict[str, Any] | None = None):
        if action == "list":
            return [
                {"name": "search", "description": "d", "inputSchema": {"type": "object"}},
            ]
        return {"raw": tool, "args": arguments}

    monkeypatch.setattr(pool_module, "_session_call", fake_session_call)

    listing = await pool_module._session_call("https://s.example/mcp", "list")
    assert listing[0]["name"] == "search"

    pool = MCPClientPool([MCPServerConfig(name="srv", url="https://s.example/mcp")])
    tools = await pool.discover()
    assert list(tools) == ["mcp.srv.search"]
    spec = tools["mcp.srv.search"]
    assert spec.raw_name == "search" and spec.parameters == {"type": "object"}

    # Duplicate names across servers keep the first discovery deterministic.
    pool_dup = MCPClientPool(
        [
            MCPServerConfig(name="srv", url="https://s.example/mcp"),
            MCPServerConfig(name="srv", url="https://other.example/mcp"),
        ]
    )
    tools_dup = await pool_dup.discover()
    assert len(tools_dup) == 1 and tools_dup["mcp.srv.search"] is not None


@pytest.mark.asyncio
async def test_call_routes_to_owing_server(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, dict[str, Any]]] = []

    async def fake_session_call(url: str, action: str, tool: str = "", arguments: dict[str, Any] | None = None):
        if action == "list":
            return [{"name": "find", "description": "d", "inputSchema": {}}]
        calls.append((url, tool, arguments or {}))
        return [{"title": "T"}]

    monkeypatch.setattr(pool_module, "_session_call", fake_session_call)
    pool = MCPClientPool([MCPServerConfig(name="srv", url="https://s.example/mcp")])
    await pool.discover()
    result = await pool.call_tool("mcp.srv.find", {"q": 1})

    assert result == [{"title": "T"}]
    assert calls == [("https://s.example/mcp", "find", {"q": 1})]


@pytest.mark.asyncio
async def test_call_unknown_tool_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_session_call(url: str, action: str, tool: str = "", arguments: dict[str, Any] | None = None):
        return []

    monkeypatch.setattr(pool_module, "_session_call", fake_session_call)
    pool = MCPClientPool([MCPServerConfig(name="srv", url="https://s.example/mcp")])
    await pool.discover()
    with pytest.raises(KeyError, match="mcp.srv.missing"):
        await pool.call_tool("mcp.srv.missing")


@pytest.mark.asyncio
async def test_discover_cache_and_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    discovery_count = 0

    async def fake_session_call(url: str, action: str, tool: str = "", arguments: dict[str, Any] | None = None):
        nonlocal discovery_count
        if action == "list":
            discovery_count += 1
            return [{"name": "t", "description": "d", "inputSchema": {}}]
        return {}

    monkeypatch.setattr(pool_module, "_session_call", fake_session_call)
    monkeypatch.setattr(pool_module, "_discovery_cache", {})

    servers = [MCPServerConfig(name="srv", url="https://s.example/mcp")]
    first = await discover_remote_tools(servers)
    second = await discover_remote_tools(servers)
    assert first is second and discovery_count == 1  # served from cache

    cached_key = next(iter(pool_module._discovery_cache))
    stamp, _tools = pool_module._discovery_cache[cached_key]
    pool_module._discovery_cache[cached_key] = (stamp - pool_module._DISCOVERY_TTL_SECONDS - 1, _tools)
    await discover_remote_tools(servers)
    assert discovery_count == 2  # TTL expired → rediscovery


@pytest.mark.asyncio
async def test_no_servers_returns_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = pool_module.get_settings()
    monkeypatch.setattr(settings.__class__, "mcp_server_list", property(lambda self: []))
    assert await discover_remote_tools() == {}
