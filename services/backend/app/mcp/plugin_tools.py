"""Per-user declarative plugin MCP tools.

Port of the legacy ``lib/plugins/mcp-declarative.ts`` execution: a plugin
manifest may declare HTTPS tools with a small JSON-Schema parameter subset.
These are resolved **per owner** at run time — never registered in the
process-global :data:`app.mcp.registry.registry` — and executed through the
SSRF/size guards in :mod:`app.mcp.guards`.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.guards import GuardError, assert_safe_https_url, guarded_request_json
from app.mcp.registry import registry
from app.models import PluginInstall

# Hard bounds so a manifest cannot balloon memory or run unbounded work.
MAX_TOOLS_PER_MANIFEST = 32
MAX_TOOLS_PER_OWNER = 128

_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,127}$")
_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
_ALLOWED_METHODS = {"GET", "POST"}
# Headers a manifest may not set: credentials are server-side only.
_BLOCKED_HEADERS = {"authorization", "cookie", "host", "proxy-authorization", "x-api-key", "api-key"}


@dataclass(frozen=True)
class PluginToolDef:
    """A validated, owner-scoped declarative tool definition."""

    name: str
    description: str
    parameters: dict[str, Any]
    method: str
    url: str
    plugin_id: str
    headers: dict[str, str] = field(default_factory=dict)
    body_template: str = "json-params"
    result_path: str | None = None
    timeout_ms: int = 20_000


def _validate_static_url(template: str) -> None:
    """Validate the URL template's static parts (placeholders become a literal)."""
    assert_safe_https_url(_PLACEHOLDER_RE.sub("placeholder", template))


def parse_plugin_tools(plugin_id: str, manifest: dict[str, Any] | None) -> list[PluginToolDef]:
    """Parse a manifest's ``mcpTools`` into validated definitions (skipping invalid ones)."""
    tools: list[PluginToolDef] = []
    raw_tools = (manifest or {}).get("mcpTools") or []
    if not isinstance(raw_tools, list):
        return tools

    seen: set[str] = set()
    for raw in raw_tools[:MAX_TOOLS_PER_MANIFEST]:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name")
        http = raw.get("http")
        if not isinstance(name, str) or not _NAME_RE.match(name) or not isinstance(http, dict):
            continue
        # Never shadow a built-in tool or duplicate within a manifest.
        if name in seen or registry.get(name) is not None:
            continue
        method = str(http.get("method", "GET")).upper()
        url = http.get("url")
        if method not in _ALLOWED_METHODS or not isinstance(url, str) or not url:
            continue
        try:
            _validate_static_url(url)
        except GuardError:
            continue

        raw_headers = http.get("headers")
        headers = {
            str(key): str(value)
            for key, value in (raw_headers.items() if isinstance(raw_headers, dict) else [])
            if str(key).lower() not in _BLOCKED_HEADERS
        }
        parameters = raw.get("parameters")
        if not isinstance(parameters, dict):
            parameters = {"type": "object", "properties": {}}
        result_path = raw.get("resultPath")
        try:
            timeout_ms = min(max(int(http.get("timeoutMs", 20_000)), 1_000), 60_000)
        except (TypeError, ValueError):
            timeout_ms = 20_000

        tools.append(
            PluginToolDef(
                name=name,
                description=str(raw.get("description") or name),
                parameters=parameters,
                method=method,
                url=url,
                plugin_id=plugin_id,
                headers=headers,
                body_template=str(http.get("bodyTemplate") or "json-params"),
                result_path=str(result_path) if result_path else None,
                timeout_ms=timeout_ms,
            )
        )
        seen.add(name)
    return tools


def _validate_params(spec: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    """Validate params against the JSON-Schema subset (required keys + closed set)."""
    properties = spec.get("properties") if isinstance(spec.get("properties"), dict) else {}
    required = spec.get("required") if isinstance(spec.get("required"), list) else []
    cleaned: dict[str, Any] = {}
    for key, value in params.items():
        if properties and key not in properties:
            raise GuardError(f"Unknown parameter: {key}")
        cleaned[key] = value
    for key in required:
        if key not in cleaned:
            raise GuardError(f"Missing required parameter: {key}")
    return cleaned


def _interpolate(template: str, params: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        value = params.get(match.group(1))
        return "" if value is None else quote(str(value), safe="")

    return _PLACEHOLDER_RE.sub(replace, template)


def _dig(obj: Any, path: str) -> Any:
    current = obj
    for part in path.split("."):
        if not part:
            continue
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


async def execute_plugin_tool(tool: PluginToolDef, params: dict[str, Any]) -> Any:
    """Execute a declarative tool through the guarded HTTP client."""
    validated = _validate_params(tool.parameters, params)
    url = _interpolate(tool.url, validated)
    result = await guarded_request_json(
        tool.method,
        url,
        params=validated if tool.method == "GET" else None,
        headers=tool.headers or None,
        json_body=validated if tool.method == "POST" else None,
        timeout=tool.timeout_ms / 1000,
    )
    return _dig(result, tool.result_path) if tool.result_path else result


async def load_user_tools(session: AsyncSession, owner_id: uuid.UUID) -> dict[str, PluginToolDef]:
    """Resolve the enabled declarative tools declared by one owner's installs.

    Owner-scoped: a tool is only ever visible to the user who installed it.
    """
    installs = (
        await session.scalars(
            select(PluginInstall).where(PluginInstall.owner_id == owner_id, PluginInstall.enabled.is_(True))
        )
    ).all()
    tools: dict[str, PluginToolDef] = {}
    for install in installs:
        for tool in parse_plugin_tools(install.id, install.manifest):
            tools.setdefault(tool.name, tool)
            if len(tools) >= MAX_TOOLS_PER_OWNER:
                return tools
    return tools
