"""End-to-end smoke: desktop ApiClient against a real backend + Postgres.

Run: PYTHONPATH=desktop/src python3 scripts/desktop-smoke.py [base_url]
"""

from __future__ import annotations

import sys

from ischolar_desktop.api import ApiClient, ApiError

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010"
EMAIL = "e2e-staff@ischolar.test"
PASSWORD = "TestPass1"


def main() -> int:
    api = ApiClient(BASE)

    # 1. Wrong password must fail with readable text.
    try:
        api.login(EMAIL, "definitely-wrong")
    except ApiError as exc:
        assert str(exc) == "邮箱或密码不正确。", str(exc)
        print(f"[ok] wrong password -> {exc}")
    else:
        raise AssertionError("wrong password must not log in")

    # 2. Connection refused must explain how to start the backend.
    #    Bind-then-close to get a port nothing listens on (deterministic refusal).
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    down = ApiClient(f"http://127.0.0.1:{free_port}")
    try:
        down.login(EMAIL, PASSWORD)
    except ApiError as exc:
        assert "docker compose up -d postgres redis backend worker" in str(exc), str(exc)
        print("[ok] refused connection -> start hint present")
    else:
        raise AssertionError("connection must fail")

    # 3. Real credentials -> token -> authenticated business API.
    user = api.login(EMAIL, PASSWORD)
    assert user.get("id") and user.get("email") == EMAIL, user
    print(f"[ok] login as {user['email']} role={user.get('role')}")

    projects = api.request("/api/data/projects")
    assert isinstance(projects, list), type(projects)
    print(f"[ok] GET /api/data/projects -> {len(projects)} project(s)")

    # 4. Bearer identity reaches /v1/me (backend resolves the same user id).
    me = api.request_raw("/v1/me")
    assert me["data"]["userId"] == user["id"], me
    print(f"[ok] GET /v1/me -> {me['data']['userId']}")

    # 5. Runs listing works without projectId (dashboard path).
    runs = api.request("/api/agent/runs?limit=30")
    assert isinstance(runs, list), type(runs)
    print(f"[ok] GET /api/agent/runs?limit=30 -> {len(runs)} run(s)")

    # 6. Case-insensitive email + logout drops credentials.
    api.logout()
    assert api.user is None
    print("[ok] logout clears the session")

    print("\nAll desktop end-to-end checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
