import errno
import json
import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError

from ischolar_desktop.api import (
    ApiClient,
    ApiError,
    DirectProxyHandler,
    _is_loopback,
    backend_path,
    connection_error_message,
    humanize_error,
)


class LoopbackProxyBypassTests(unittest.TestCase):
    """A dev/system http_proxy must never swallow traffic to 127.0.0.1."""

    def test_loopback_hosts_detected(self) -> None:
        for host in ("127.0.0.1:8010", "127.0.0.1", "localhost:3000", "LOCALHOST", "[::1]:8000", "::1", "127.5.6.7:1"):
            self.assertTrue(_is_loopback(host), host)

    def test_remote_hosts_are_not_loopback(self) -> None:
        for host in ("ischolar.example", "192.168.1.10:8000", "127.0.0.1.attacker.example", None, ""):
            self.assertFalse(_is_loopback(host), str(host))

    def test_loopback_proxy_open_returns_none(self) -> None:
        import urllib.request as urllib_request

        handler = DirectProxyHandler({"http": "http://localhost:10808"})
        request = urllib_request.Request("http://127.0.0.1:8010/v1/healthz")
        # None means "no proxy applied" -> the request goes out directly.
        self.assertIsNone(handler.proxy_open(request, "http://localhost:10808", "http"))

    def test_opener_uses_the_bypassing_handler(self) -> None:
        api = ApiClient()
        self.assertTrue(
            any(isinstance(h, DirectProxyHandler) for h in api._opener.handlers),
            "ApiClient must route HTTP through DirectProxyHandler",
        )


class ConnectionErrorMessageTests(unittest.TestCase):
    def test_local_connection_refused_includes_start_command(self) -> None:
        error = URLError(ConnectionRefusedError(errno.ECONNREFUSED, "Connection refused"))

        message = connection_error_message("http://127.0.0.1:8000", error)

        self.assertIn("本机后端", message)
        self.assertIn("docker compose up -d postgres redis backend worker", message)
        self.assertIn("uvicorn app.main:app", message)
        self.assertIn("Connection refused", message)
        # The desktop no longer depends on the web process.
        self.assertNotIn("next dev", message)

    def test_remote_connection_refused_keeps_generic_error(self) -> None:
        error = URLError(ConnectionRefusedError(errno.ECONNREFUSED, "Connection refused"))

        message = connection_error_message("https://ischolar.example", error)

        self.assertNotIn("docker compose up", message)
        self.assertIn("https://ischolar.example", message)

    def test_timeout_does_not_suggest_starting_local_service(self) -> None:
        error = URLError(TimeoutError("timed out"))

        message = connection_error_message("http://localhost:8000", error)

        self.assertNotIn("docker compose up", message)
        self.assertIn("timed out", message)


class BackendPathTests(unittest.TestCase):
    def test_api_prefix_maps_to_v1(self) -> None:
        self.assertEqual(backend_path("/api/data/projects"), "/v1/data/projects")
        self.assertEqual(backend_path("/api/agent/runs?limit=30"), "/v1/agent/runs?limit=30")
        self.assertEqual(backend_path("/api/mcp/tools"), "/v1/mcp/tools")
        self.assertEqual(backend_path("/api/training/me?include=all"), "/v1/training/me?include=all")

    def test_auth_and_v1_paths_pass_through(self) -> None:
        self.assertEqual(backend_path("/v1/auth/login"), "/v1/auth/login")
        self.assertEqual(backend_path("/health"), "/health")


class HumanizeErrorTests(unittest.TestCase):
    def test_known_codes_become_readable_text(self) -> None:
        self.assertEqual(humanize_error("INVALID_CREDENTIALS"), "邮箱或密码不正确。")
        self.assertEqual(humanize_error("TOO_MANY_ATTEMPTS"), "尝试次数过多，请稍后再试。")

    def test_unknown_detail_passes_through(self) -> None:
        self.assertEqual(humanize_error("PROJECT_NOT_FOUND"), "项目不存在或无权访问。")
        self.assertEqual(humanize_error("some new code"), "some new code")


class _StubBackend(BaseHTTPRequestHandler):
    """Minimal backend: POST /v1/auth/login + authenticated GET /v1/data/projects."""

    requests: list[dict] = []
    password_ok = True

    def log_message(self, *args) -> None:  # keep test output clean
        return

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        type(self).requests.append(
            {"path": self.path, "authorization": self.headers.get("Authorization"), "body": body}
        )
        if self.path != "/v1/auth/login":
            return self._json(404, {"detail": "NOT_FOUND"})
        if not self.password_ok or body.get("password") != "TestPass1":
            return self._json(401, {"detail": "INVALID_CREDENTIALS"})
        return self._json(
            200,
            {
                "ok": True,
                "data": {
                    "accessToken": "stub-token-abc",
                    "tokenType": "Bearer",
                    "expiresIn": 43200,
                    "user": {"id": "user-1", "email": body.get("email"), "name": "Tester", "role": "learner"},
                },
            },
        )

    def do_GET(self) -> None:
        type(self).requests.append({"path": self.path, "authorization": self.headers.get("Authorization")})
        if self.headers.get("Authorization") != "Bearer stub-token-abc":
            return self._json(401, {"detail": "MISSING_SERVICE_IDENTITY"})
        return self._json(200, {"ok": True, "data": [{"id": "p1", "name": "项目一"}]})


class ApiClientFlowTests(unittest.TestCase):
    """End-to-end against a stub backend on 127.0.0.1 (no web/BFF involved)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _StubBackend)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self) -> None:
        _StubBackend.requests = []
        _StubBackend.password_ok = True
        self.api = ApiClient(self.base_url)

    def test_default_base_url_is_backend(self) -> None:
        self.assertEqual(ApiClient().base_url, "http://127.0.0.1:8000")

    def test_loopback_login_works_with_dead_http_proxy_env(self) -> None:
        """Regression: http_proxy=localhost:<dead> must not break 127.0.0.1 calls.

        urllib honors http_proxy by default; without the bypass, a running but
        misbehaving proxy answers 503 for loopback targets and the desktop
        cannot reach its own backend.
        """
        import os

        old = {key: os.environ.get(key) for key in ("http_proxy", "HTTP_PROXY")}
        # A port nothing listens on: proxied requests fail, direct ones succeed.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            dead_port = probe.getsockname()[1]
        os.environ["http_proxy"] = os.environ["HTTP_PROXY"] = f"http://127.0.0.1:{dead_port}"
        try:
            api = ApiClient(self.base_url)
            user = api.login("tester@ischolar.test", "TestPass1")
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
        self.assertEqual(user["id"], "user-1")

    def test_login_success_stores_token_and_user(self) -> None:
        user = self.api.login("tester@ischolar.test", "TestPass1")

        self.assertEqual(user["id"], "user-1")
        self.assertEqual(self.api.user["role"], "learner")
        sent = _StubBackend.requests[0]
        self.assertEqual(sent["path"], "/v1/auth/login")
        self.assertIsNone(sent["authorization"])  # login itself is unauthenticated

    def test_requests_carry_bearer_token_and_v1_path(self) -> None:
        self.api.login("tester@ischolar.test", "TestPass1")

        projects = self.api.request("/api/data/projects")

        self.assertEqual(projects, [{"id": "p1", "name": "项目一"}])
        sent = _StubBackend.requests[-1]
        self.assertEqual(sent["path"], "/v1/data/projects")
        self.assertEqual(sent["authorization"], "Bearer stub-token-abc")

    def test_wrong_password_surfaces_readable_error(self) -> None:
        _StubBackend.password_ok = False

        with self.assertRaises(ApiError) as ctx:
            self.api.login("tester@ischolar.test", "wrong-password")

        self.assertEqual(str(ctx.exception), "邮箱或密码不正确。")
        self.assertEqual(ctx.exception.status, 401)
        self.assertIsNone(self.api.user)

    def test_login_against_old_backend_explains_missing_endpoint(self) -> None:
        """A backend without /v1/auth/login (404) must not show raw "Not Found"."""
        real_open = self.api._opener.open

        def fake_open(request, timeout=None):
            import io
            import urllib.error as urlerror

            raise urlerror.HTTPError(request.full_url, 404, "Not Found", {}, io.BytesIO(b'{"detail":"Not Found"}'))

        self.api._opener.open = fake_open  # type: ignore[method-assign]
        try:
            with self.assertRaises(ApiError) as ctx:
                self.api.login("tester@ischolar.test", "TestPass1")
        finally:
            self.api._opener.open = real_open  # type: ignore[method-assign]

        self.assertIn("版本可能过旧", str(ctx.exception))
        self.assertEqual(ctx.exception.status, 404)

    def test_logout_drops_token(self) -> None:
        self.api.login("tester@ischolar.test", "TestPass1")
        self.api.logout()

        self.assertIsNone(self.api.user)
        # Next request goes out without credentials (backend rejects it).
        with self.assertRaises(ApiError):
            self.api.request("/api/data/projects")


if __name__ == "__main__":
    unittest.main()
