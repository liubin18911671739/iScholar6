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

# Loopback / private / link-local / cloud-metadata hostnames.
_PRIVATE_HOST_RE = re.compile(
    r"^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local|10\.\d+\.\d+\.\d+|"
    r"192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|"
    r"metadata\.google\.internal)$",
    re.IGNORECASE,
)


class GuardError(ValueError):
    """Raised when a tool URL or response violates a guard."""


def is_blocked_host(hostname: str) -> bool:
    """True when the hostname is loopback, private, link-local, or metadata."""
    host = hostname.lower().rstrip(".")
    if _PRIVATE_HOST_RE.match(host):
        return True
    if host.startswith(("fc", "fd", "fe80")):
        return True
    # Reject literal private/reserved IPs (IPv4 + IPv6) even if not in the regex.
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified


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


async def guarded_get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> Any:
    """Fetch JSON from an allow-listed https URL with redirects disabled and a size cap."""
    assert_safe_https_url(url)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        async with client.stream("GET", url, params=params, headers=headers) as response:
            response.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise GuardError("Tool response too large")
                chunks.append(chunk)
    return json.loads(b"".join(chunks))
