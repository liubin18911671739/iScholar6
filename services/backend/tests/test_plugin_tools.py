"""Declarative per-user plugin MCP tools (no network, no database)."""

from __future__ import annotations

import pytest

from app.mcp.guards import GuardError
from app.mcp.plugin_tools import (
    PluginToolDef,
    _interpolate,
    _validate_params,
    execute_plugin_tool,
    parse_plugin_tools,
)


def _manifest(tool: dict) -> dict:
    return {"mcpTools": [tool]}


def test_parse_valid_tool() -> None:
    tool = parse_plugin_tools(
        "demo",
        _manifest(
            {
                "name": "demo.lookup",
                "description": "Look up a record",
                "parameters": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
                "http": {"method": "GET", "url": "https://api.example.com/search?q={q}", "headers": {"Accept": "application/json"}},
            }
        ),
    )[0]
    assert tool.name == "demo.lookup"
    assert tool.method == "GET"
    assert tool.plugin_id == "demo"
    assert tool.headers == {"Accept": "application/json"}


def test_parse_rejects_unsafe_or_shadowing_tools() -> None:
    assert parse_plugin_tools("d", _manifest({"name": "d.a", "http": {"method": "GET", "url": "http://example.com"}})) == []
    assert parse_plugin_tools("d", _manifest({"name": "d.b", "http": {"method": "GET", "url": "https://localhost/x"}})) == []
    assert parse_plugin_tools("d", _manifest({"name": "scholar.search", "http": {"method": "GET", "url": "https://example.com"}})) == []
    assert parse_plugin_tools("d", _manifest({"name": "d.c", "http": {"method": "DELETE", "url": "https://example.com"}})) == []


def test_parse_strips_blocked_headers() -> None:
    tool = parse_plugin_tools(
        "d",
        _manifest(
            {
                "name": "d.h",
                "http": {
                    "method": "GET",
                    "url": "https://example.com",
                    "headers": {"Authorization": "Bearer secret", "Accept": "application/json"},
                },
            }
        ),
    )[0]
    assert "Authorization" not in tool.headers
    assert tool.headers["Accept"] == "application/json"


def test_validate_params_enforces_required_and_closed_set() -> None:
    spec = {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}
    assert _validate_params(spec, {"q": "x"}) == {"q": "x"}
    with pytest.raises(GuardError):
        _validate_params(spec, {})
    with pytest.raises(GuardError):
        _validate_params(spec, {"q": "x", "extra": 1})


def test_interpolate_url_encodes_values() -> None:
    assert _interpolate("https://x/{q}", {"q": "a b&c"}) == "https://x/a%20b%26c"


@pytest.mark.asyncio
async def test_execute_plugin_tool_interpolates_and_extracts(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    async def fake_request(method: str, url: str, **kwargs: object) -> dict:
        captured.update({"method": method, "url": url, **kwargs})
        return {"data": {"items": [1, 2]}}

    monkeypatch.setattr("app.mcp.plugin_tools.guarded_request_json", fake_request)
    tool = PluginToolDef(
        name="d.x",
        description="",
        parameters={"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]},
        method="GET",
        url="https://api.example.com/find?q={q}",
        plugin_id="d",
        result_path="data.items",
    )

    result = await execute_plugin_tool(tool, {"q": "ai"})

    assert result == [1, 2]
    assert captured["method"] == "GET"
    assert captured["url"] == "https://api.example.com/find?q=ai"
