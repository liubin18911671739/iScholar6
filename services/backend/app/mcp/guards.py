"""SSRF and response-size guards for external MCP tool calls.

Port of the legacy ``lib/plugins/mcp-declarative.ts`` guards: https-only,
blocked private/link-local/metadata hosts, no embedded credentials, redirects
disabled, and a hard response-size cap.
"""

from __future__ import annotations

import ipaddress
import json
import re
from typing import Any
from urllib.parse import urlparse

import httpx

# Upper bound on accepted external tool response size (2 MiB).
MAX_RESPONSE_BYTES = 2 * 1024 * 1024

_BLOCKED_NAMES = {"localhost", "metadata.google.internal"}

# Non-canonical numeric IPv4 forms (decimal / hex) that `ipaddress` rejects but
# the OS resolver accepts (e.g. 2130706433, 0x7f000001, 127.1).
_NUMERIC_HOST_RE = re.compile(r"^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+)){0,3}$", re.IGNORECASE)


class GuardError(ValueError):
    """Raised when a tool URL or response violates a guard."""


def _is_blocked_ip(ip: Any) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_unspecified
        or ip.is_multicast
    )


def is_blocked_host(hostname: str) -> bool:
    """True when a host is loopback/private/link-local/metadata, a literal private IP, or a non-canonical numeric form.

    DNS is intentionally not resolved here (keeps the check deterministic and
    offline-safe); the request is https-only, redirects are disabled, and the
    response is size-capped.
    """
    host = hostname.lower().rstrip(".")
    if not host:
        return True
    if host in _BLOCKED_NAMES or host.endswith(".local"):
        return True

    # Literal IP (canonical) — validate directly.
    try:
        return _is_blocked_ip(ipaddress.ip_address(host.strip("[]")))
    except ValueError:
        pass

    # Non-canonical numeric forms that sockets would still interpret as an IP
    # (e.g. 2130706433, 0x7f000001, 127.1).
    if _NUMERIC_HOST_RE.match(host):
        return True
    return False


def assert_safe_https_url(url_string: str) -> str:
    """Validate an https, host-safe, credential-free URL and return it."""
    parsed = urlparse(url_string)
    if parsed.scheme != "https":
        raise GuardError("Tool URL must use https")
    if not parsed.hostname:
        raise GuardError("Invalid tool URL")
    if is_blocked_host(parsed.hostname):
        raise GuardError(f"Blocked host: {parsed.hostname}")
    if parsed.username or parsed.password:
        raise GuardError("Tool URL must not include credentials")
    return url_string


def check_body_size(content_length: str | None, max_bytes: int) -> bool:
    """True when the declared content length is absent or within the byte cap."""
    if not content_length:
        return True
    try:
        return int(content_length) <= max_bytes
    except ValueError:
        return True


async def guarded_request_json(
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    json_body: Any | None = None,
    timeout: float = 20.0,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> Any:
    """Call an allow-listed https URL (GET/POST) with redirects disabled and a size cap."""
    verb = method.upper()
    if verb not in {"GET", "POST"}:
        raise GuardError(f"Unsupported method: {verb}")
    assert_safe_https_url(url)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        async with client.stream(verb, url, params=params, headers=headers, json=json_body) as response:
            response.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise GuardError("Tool response too large")
                chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw.decode("utf-8", errors="replace")


async def guarded_get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> Any:
    """Fetch JSON from an allow-listed https URL with redirects disabled and a size cap."""
    return await guarded_request_json(
        "GET", url, params=params, headers=headers, timeout=timeout, max_bytes=max_bytes
    )
