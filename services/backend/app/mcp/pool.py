"""MCP client pool.

Connects to configured MCP servers over streamable HTTP, lists their tools, and
routes tool calls to the owning server. When no servers are configured the pool
falls back to the in-process registry (built-ins), so the agent runtime always
has a tool surface.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.mcp.registry import registry


@dataclass(frozen=True)
class MCPServerConfig:
    """A remote MCP server endpoint."""

    name: str
    url: str


class MCPClientPool:
    """Lazily connects to MCP servers and routes calls by tool name."""

    def __init__(self, servers: list[MCPServerConfig] | None = None) -> None:
        self.servers = servers or []
        self._tool_server: dict[str, str] = {}

    async def _list_server_tools(self, server: MCPServerConfig) -> list[dict[str, Any]]:
        async with streamablehttp_client(server.url) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                return [
                    {"name": tool.name, "description": tool.description, "server": server.name}
                    for tool in result.tools
                ]

    async def list_tools(self) -> list[dict[str, Any]]:
        """List tools across all configured servers, or the in-process registry."""
        if not self.servers:
            return [
                {"name": tool.name, "description": tool.description, "server": "builtin"}
                for tool in registry.list()
            ]
        tools: list[dict[str, Any]] = []
        for server in self.servers:
            tools.extend(await self._list_server_tools(server))
        self._tool_server = {tool["name"]: tool["server"] for tool in tools}
        return tools

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        """Call a tool on the owning server, or the in-process registry."""
        if not self.servers:
            return await registry.call(name, arguments or {})
        if name not in self._tool_server:
            await self.list_tools()
        server_name = self._tool_server.get(name)
        server = next((s for s in self.servers if s.name == server_name), None)
        if server is None:
            raise KeyError(f"Unknown MCP tool: {name}")
        async with streamablehttp_client(server.url) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments or {})
                return result.model_dump() if hasattr(result, "model_dump") else result
