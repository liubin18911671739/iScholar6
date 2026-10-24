"""Authenticated client for the existing Next.js BFF.

The desktop app never receives the backend service signing secret. It signs
in through Auth.js, retains the session cookie locally, and makes same-origin
requests through the existing authenticated proxy routes.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from typing import Any


class ApiError(RuntimeError):
    """An HTTP or application API error suitable for display in the UI."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class ApiClient:
    """Cookie-authenticated access to Next.js BFF endpoints."""

    def __init__(self, base_url: str = "http://127.0.0.1:3000") -> None:
        self.base_url = base_url.rstrip("/")
        self._cookies = CookieJar()
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self._cookies))
        self._lock = threading.RLock()
        self.user: dict[str, Any] | None = None

    def set_base_url(self, value: str) -> None:
        self.base_url = value.strip().rstrip("/")

    def login(self, email: str, password: str) -> dict[str, Any]:
        csrf = self._open("/api/auth/csrf", method="GET")
        token = csrf.get("csrfToken")
        if not token:
            raise ApiError("认证服务未返回 CSRF token。请确认 Next.js 服务已启动。")
        form = urllib.parse.urlencode(
            {"email": email.strip(), "password": password, "csrfToken": token, "callbackUrl": "/dashboard"}
        ).encode()
        self._open(
            "/api/auth/callback/credentials",
            method="POST",
            body=form,
            content_type="application/x-www-form-urlencoded",
        )
        session = self._open("/api/auth/session", method="GET")
        user = session.get("user") if isinstance(session, dict) else None
        if not user:
            raise ApiError("邮箱或密码不正确，或当前会话未建立。")
        self.user = user
        return user

    def logout(self) -> None:
        try:
            csrf = self._open("/api/auth/csrf", method="GET")
            token = str(csrf.get("csrfToken") or "")
            body = urllib.parse.urlencode({"csrfToken": token, "callbackUrl": "/login"}).encode()
            self._open("/api/auth/signout", method="POST", body=body, content_type="application/x-www-form-urlencoded")
        finally:
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
        url = self.base_url + (path if path.startswith("/") else f"/{path}")
        headers = {"Accept": "application/json"}
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self._lock, self._opener.open(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            try:
                detail = exc.read().decode("utf-8", "replace")
            except Exception:
                detail = str(exc)
            raise ApiError(detail[:1000] or f"HTTP {exc.code}", exc.code) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(f"无法连接到 {self.base_url}：{exc}") from exc
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw
