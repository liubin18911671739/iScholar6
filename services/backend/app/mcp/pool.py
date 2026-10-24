"""MCP client pool.

Connects to configured MCP servers over streamable HTTP, lists their tools
(namespaced as ``mcp.<server>.<tool>`` to avoid collisions), and routes calls
to the owning server. When no servers are configured the runtime falls back to
the in-process registry (built-ins), so the agent runtime always has a tool
surface.

Discovery is cached with a TTL: listing tools requires a full MCP session per
server, and per-run discovery would add latency to every claim.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.core.config import get_settings
from app.mcp.registry import registry

logger = logging.getLogger(__name__)

_DISCOVERY_TTL_SECONDS = 300


@dataclass(frozen=True)
class MCPServerConfig:
    """A remote MCP server endpoint."""

    name: str
    url: str


@dataclass(frozen=True)
class RemoteMCPTool:
    """A remote MCP tool; ``name`` is the harness-facing namespaced name."""

    name: str
    raw_name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=dict)
    server_name: str = ""
    server_url: str = ""


def validate_server_url(url_string: str) -> str:
    """Validate a deployment-configured MCP server URL.

    Unlike plugin tool URLs (client-supplied, https-strict via
    :mod:`app.mcp.guards`), these are operator-configured: https is mandatory
    in production, developer deployments may use http for in-network servers.
    Credentials in the URL are never accepted.
    """
    parsed = urlparse(url_string)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Invalid MCP server URL: {url_string}")
    if get_settings().is_production and parsed.scheme != "https":
        raise ValueError(f"MCP server URL must use https in production: {url_string}")
    if parsed.username or parsed.password:
        raise ValueError(f"MCP server URL must not include credentials: {url_string}")
    return url_string


def _extract_result(result: Any) -> Any:
    """Convert an MCP ``CallToolResult`` into JSON-friendly data."""
    if hasattr(result, "model_dump"):
        result = result.model_dump()
    if not isinstance(result, dict):
        return result
    content = result.get("content")
    if isinstance(content, list):
        parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        if parts:
            import json

            text = "\n".join(parts)
            try:
                return json.loads(text)
            except ValueError:
                return text
    return result


async def _session_call(url: str, action: str, tool: str = "", arguments: dict[str, Any] | None = None) -> Any:
    """Open a streamable-HTTP session, run one call, then close."""
    validate_server_url(url)
    async with streamablehttp_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            if action == "list":
                listing = await session.list_tools()
                return [
                    {
                        "name": tool_def.name,
                        "description": tool_def.description or "",
                        "inputSchema": tool_def.inputSchema if isinstance(tool_def.inputSchema, dict) else {},
                    }
                    for tool_def in listing.tools
                ]
            result = await session.call_tool(tool, arguments or {})
            return _extract_result(result)


class MCPClientPool:
    """Connects to MCP servers and routes calls by namespaced tool name."""

    def __init__(self, servers: list[MCPServerConfig] | None = None) -> None:
        self.servers = servers or []
        self._tools: dict[str, RemoteMCPTool] = {}

    async def list_tools(self) -> list[dict[str, Any]]:
        """List tools across all configured servers, or the in-process registry."""
        if not self.servers:
            return [
                {"name": tool.name, "description": tool.description, "server": "builtin"}
                for tool in registry.list()
            ]
        tools: list[dict[str, Any]] = []
        for server in self.servers:
            for entry in await _session_call(server.url, "list"):
                tools.append({**entry, "server": server.name})
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        """Call a namespaced tool on the owning server, or the in-process registry."""
        if not self.servers:
            return await registry.call(name, arguments or {})
        if not self._tools:
            await self.discover()
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(f"Unknown MCP tool: {name}")
        return await _session_call(tool.server_url, "call", tool.raw_name, arguments or {})

    async def discover(self) -> dict[str, RemoteMCPTool]:
        """Discover remote tools, namespaced ``mcp.<server>.<tool>``."""
        tools: dict[str, RemoteMCPTool] = {}
        for server in self.servers:
            for entry in await _session_call(server.url, "list"):
                name = f"mcp.{server.name}.{entry['name']}"
                if name in tools:
                    logger.warning("duplicate MCP tool name %s; keeping first", name)
                    continue
                tools[name] = RemoteMCPTool(
                    name=name,
                    raw_name=entry["name"],
                    description=entry["description"],
                    parameters=entry["inputSchema"],
                    server_name=server.name,
                    server_url=server.url,
                )
        self._tools = tools
        return tools


_discovery_cache: dict[tuple[tuple[str, str], ...], tuple[float, dict[str, RemoteMCPTool]]] = {}
_discovery_lock = asyncio.Lock()


async def discover_remote_tools(servers: list[MCPServerConfig] | None = None) -> dict[str, RemoteMCPTool]:
    """Cached discovery across all configured servers; empty when unconfigured."""
    settings = get_settings()
    if not settings.mcp_enabled:
        return {}
    if servers is not None:
        server_configs = list(servers)
    else:
        server_configs = [
            MCPServerConfig(name=entry["name"], url=entry["url"]) for entry in settings.mcp_server_list
        ]
    if not server_configs:
        return {}
    key = tuple(sorted((server.name, server.url) for server in server_configs))
    async with _discovery_lock:
        cached = _discovery_cache.get(key)
        if cached and time.monotonic() - cached[0] < _DISCOVERY_TTL_SECONDS:
            return cached[1]
        pool = MCPClientPool(server_configs)
        tools = await pool.discover()
        _discovery_cache[key] = (time.monotonic(), tools)
        return tools


async def call_remote_tool(tool: RemoteMCPTool, arguments: dict[str, Any]) -> Any:
    """Execute one remote MCP tool call (fresh session, validated URL)."""
    return await _session_call(tool.server_url, "call", tool.raw_name, arguments)
