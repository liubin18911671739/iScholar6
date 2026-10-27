"""Authenticated client for the FastAPI backend.

The desktop app talks directly to the backend (default ``127.0.0.1:8000``) —
no Next.js/BFF process is required. It signs in once via ``POST
/v1/auth/login`` with email + password, keeps the returned short-lived bearer
access token in memory, and attaches it to every request. The backend's
service-signing secret never enters the desktop process.

Legacy call sites use web-style ``/api/<root>/...`` paths; :func:`backend_path`
rewrites them to the backend's ``/v1/<root>/...`` prefix (the same mapping the
BFF performed).
"""

from __future__ import annotations

import errno
import ipaddress
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from typing import Any

# Backend error codes surfaced to users as-is by FastAPI, mapped to readable text.
ERROR_MESSAGES = {
    "INVALID_CREDENTIALS": "邮箱或密码不正确。",
    "TOO_MANY_ATTEMPTS": "尝试次数过多，请稍后再试。",
    "EXPIRED_ACCESS_TOKEN": "登录已过期，请重新启动应用并重新登录。",
    "INVALID_ACCESS_TOKEN": "登录状态无效，请重新启动应用并重新登录。",
    "MISSING_SERVICE_IDENTITY": "尚未登录。",
    "INVALID_SERVICE_SIGNATURE": "身份校验失败，请重新登录。",
    "UNAUTHENTICATED": "尚未登录。",
    "PROJECT_NOT_FOUND": "项目不存在或无权访问。",
    "THREAD_NOT_FOUND": "研究会话不存在或无权访问。",
    "EXTERNAL_AI_CONSENT_REQUIRED": "需要先确认 AI 服务使用授权。",
    "INVALID_MODE": "运行模式无效。",
}


def humanize_error(detail: str) -> str:
    """Translate backend error codes to user-facing text (passthrough otherwise)."""
    return ERROR_MESSAGES.get(detail, detail)


def backend_path(path: str) -> str:
    """Map a web-style ``/api/<root>/...`` path to the backend ``/v1/...`` path."""
    if path.startswith("/api/"):
        return "/v1/" + path[len("/api/") :]
    return path


def _is_loopback(host: str | None) -> bool:
    """True for hosts that must never go through an HTTP proxy.

    Parses the hostname (ports/IPv6 brackets stripped) and asks ``ipaddress``
    rather than string-prefix matching, so ``127.0.0.1.attacker.example`` is
    not mistaken for a loopback address.
    """
    if not host:
        return False
    if host.startswith("["):  # bracketed IPv6, possibly with a port: [::1]:8000
        end = host.find("]")
        name = host[1:end] if end != -1 else host
    elif host.count(":") == 1:  # host:port (a bare IPv6 address has more colons)
        name = host.split(":")[0]
    else:
        name = host
    name = name.split("%")[0].lower()  # drop any IPv6 zone id
    if name == "localhost":
        return True
    try:
        return ipaddress.ip_address(name).is_loopback
    except ValueError:
        return False


class DirectProxyHandler(urllib.request.ProxyHandler):
    """Proxy handler that bypasses proxies for loopback addresses.

    A desktop client talking to ``127.0.0.1`` must not be routed through
    ``http_proxy`` (common with dev/system proxies): the proxy usually cannot
    reach the host's own loopback and answers 503, which looks like a broken
    backend. Remote backend addresses keep the standard proxy behavior.
    """

    def proxy_open(self, req: urllib.request.Request, proxy: str, scheme: str):  # matches urllib signature
        if _is_loopback(req.host):
            return None  # loopback goes direct, skipping the proxy entirely
        return super().proxy_open(req, proxy, scheme)


def connection_error_message(base_url: str, error: Exception) -> str:
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    try:
        hostname = urllib.parse.urlsplit(base_url).hostname
    except ValueError:
        hostname = None

    is_localhost = hostname in {"localhost", "127.0.0.1", "::1"}
    is_refused = isinstance(reason, OSError) and reason.errno == errno.ECONNREFUSED
    if is_localhost and is_refused:
        return (
            f"无法连接到本机后端 {base_url}。请先启动 iScholar 后端服务（无需启动 Web 前端）。\n"
            "在项目目录运行：docker compose up -d postgres redis backend worker\n"
            "或单独运行：cd services/backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000\n"
            f"连接错误：{error}"
        )
    return f"无法连接到 {base_url}：{error}"


class ApiError(RuntimeError):
    """An HTTP or application API error suitable for display in the UI."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class ApiClient:
    """Bearer-token access to the FastAPI backend."""

    def __init__(self, base_url: str = "http://127.0.0.1:8000") -> None:
        self.base_url = base_url.rstrip("/")
        self._cookies = CookieJar()
        # DirectProxyHandler keeps loopback traffic off http_proxy while still
        # honoring it for remote backend addresses.
        self._opener = urllib.request.build_opener(DirectProxyHandler(), urllib.request.HTTPCookieProcessor(self._cookies))
        self._lock = threading.RLock()
        self._access_token: str | None = None
        self.user: dict[str, Any] | None = None

    def set_base_url(self, value: str) -> None:
        self.base_url = value.strip().rstrip("/")

    def login(self, email: str, password: str) -> dict[str, Any]:
        """Exchange credentials for a desktop access token (kept in memory)."""
        # A stale token from a previous session must not ride along.
        self._access_token = None
        self.user = None
        body = json.dumps({"email": email.strip(), "password": password}).encode("utf-8")
        try:
            result = self._open(
                "/v1/auth/login",
                method="POST",
                body=body,
                content_type="application/json",
            )
        except ApiError as exc:
            if exc.status == 404:
                raise ApiError(
                    "后端服务没有登录接口，版本可能过旧。请更新 iScholar 后端服务后重试。", 404
                ) from exc
            raise
        data = result.get("data") if isinstance(result, dict) else None
        token = (data or {}).get("accessToken")
        if not isinstance(token, str) or not token:
            raise ApiError("登录响应未包含访问令牌，请确认后端服务版本。")
        self._access_token = token
        self.user = data.get("user")
        return self.user or {}

    def logout(self) -> None:
        # The access token is stateless (short-lived JWT); dropping it locally
        # ends the desktop session without a backend round trip.
        self._access_token = None
        self.user = None
        self._cookies.clear()

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: Any | None = None,
        timeout: float = 45,
    ) -> Any:
        result = self.request_raw(path, method=method, payload=payload, timeout=timeout)
        if isinstance(result, dict) and "ok" in result:
            if not result.get("ok"):
                raise ApiError(str(result.get("error") or "API request failed"))
            return result.get("data", result)
        return result

    def request_raw(self, path: str, *, method: str = "GET", payload: Any | None = None, timeout: float = 45) -> Any:
        """Return the complete response envelope for compound endpoints."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        return self._open(path, method=method, body=body, content_type="application/json", timeout=timeout)

    def _open(
        self,
        path: str,
        *,
        method: str,
        body: bytes | None = None,
        content_type: str | None = None,
        timeout: float = 20,
    ) -> Any:
        url = self.base_url + backend_path(path if path.startswith("/") else f"/{path}")
        headers = {"Accept": "application/json"}
        if content_type:
            headers["Content-Type"] = content_type
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self._lock, self._opener.open(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raise ApiError(self._http_error_message(exc), exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(connection_error_message(self.base_url, exc)) from exc
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw

    @staticmethod
    def _http_error_message(exc: urllib.error.HTTPError) -> str:
        """Reduce FastAPI's error envelope to readable text."""
        try:
            raw = exc.read().decode("utf-8", "replace")
        except Exception:
            return f"HTTP {exc.code}"
        detail: Any = None
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                detail = parsed.get("detail", parsed.get("error"))
        except json.JSONDecodeError:
            detail = None
        if isinstance(detail, str) and detail:
            return humanize_error(detail) or f"HTTP {exc.code}"
        if detail is not None:
            # FastAPI validation errors: keep them short but visible.
            text = json.dumps(detail, ensure_ascii=False)
            return text[:1000]
        return raw[:1000] or f"HTTP {exc.code}"
