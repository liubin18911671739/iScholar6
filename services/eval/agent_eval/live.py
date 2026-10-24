"""Live evaluation against the backend agent runtime.

Requires ``EVAL_USER_ID``, ``EVAL_PROJECT_ID``, ``AGENT_SERVICE_TOKEN`` and a
reachable ``BACKEND_INTERNAL_URL``. Creates a thread + run per case, waits for
the artifact, and scores its structured content with the same deterministic
checks as offline mode.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Any

import httpx

from agent_eval.datasets import EvalCase
from agent_eval.runner import EvalReport, evaluate

POLL_INTERVAL_SECONDS = 1.0
# Real models can be slow; override with EVAL_TIMEOUT_SECONDS for live smokes.
POLL_TIMEOUT_SECONDS = float(os.environ.get("EVAL_TIMEOUT_SECONDS", "60"))


def _identity_headers(user_id: str, secret: str) -> dict[str, str]:
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), f"{user_id}:{timestamp}".encode(), hashlib.sha256).hexdigest()
    return {
        "X-IScholar-User": user_id,
        "X-IScholar-Timestamp": timestamp,
        "X-IScholar-Signature": signature,
    }


def _goal(case: EvalCase) -> str:
    return json_goal(case.input)


def json_goal(payload: dict[str, Any]) -> str:
    """Human-readable goal derived from the case input."""
    parts = [f"{key}: {value}" for key, value in payload.items()]
    return "; ".join(parts) or "Evaluate the agent."


def _as_data(response: httpx.Response) -> dict[str, Any]:
    """Unwrap the backend `{ok,data}` envelope with a readable failure."""
    if response.status_code >= 400 or "data" not in response.json():
        raise RuntimeError(f"{response.request.method} {response.request.url} -> {response.status_code} {response.text[:400]}")
    return response.json()["data"]


def _run_case(client: httpx.Client, base_url: str, user_id: str, secret: str, case: EvalCase) -> dict[str, Any]:
    def headers() -> dict[str, str]:
        # Re-sign per request: a real workflow can poll past the 300s signature
        # window, and stale headers surface as mystifying 401s mid-run.
        return _identity_headers(user_id, secret)

    project_id = os.environ["EVAL_PROJECT_ID"]
    thread = client.post(f"{base_url}/v1/agent/threads", headers=headers(), json={"projectId": project_id, "title": case.id})
    thread.raise_for_status()
    thread_id = _as_data(thread)["id"]

    run = client.post(
        f"{base_url}/v1/agent/runs",
        headers=headers(),
        json={"threadId": thread_id, "goal": _goal(case), "agent": case.agent, "input": case.input},
    )
    run.raise_for_status()
    run_id = _as_data(run)["id"]

    deadline = time.time() + POLL_TIMEOUT_SECONDS
    resumes = 0
    while time.time() < deadline:
        detail = _as_data(client.get(f"{base_url}/v1/agent/runs/{run_id}", headers=headers()))
        if detail["status"] == "waiting_for_review" and resumes < 2:
            # Workflow gates (topic/final) block on operator review; the eval
            # runner auto-approves to measure the full collaborative path.
            resume = client.post(
                f"{base_url}/v1/agent/runs/{run_id}/resume",
                headers=headers(),
                json={"approved": True, "input": {"selected": detail.get("input", {}).get("candidate")}},
            )
            resume.raise_for_status()
            resumes += 1
            time.sleep(POLL_INTERVAL_SECONDS)
            continue
        if detail["status"] in {"waiting_for_review", "succeeded"}:
            artifacts = detail.get("artifacts", [])
            if artifacts:
                content = artifacts[-1].get("content", {})
                structured = content.get("structured")
                result = detail.get("result") or {}
                if isinstance(result, dict) and result.get("steps"):
                    # Workflow runs: evaluate the whole result (steps + gates).
                    return {
                        "steps": result["steps"],
                        "quality": result.get("quality"),
                        "final": result.get("final") or {},
                    }
                return structured or {}
            return {}
        if detail["status"] in {"failed", "cancelled"}:
            raise RuntimeError(f"run {run_id} {detail['status']}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise TimeoutError(f"run {run_id} timed out")


def run_live(threshold: float, cases: list[EvalCase]) -> EvalReport:
    """Drive the backend runtime and score the structured artifacts."""
    base_url = os.environ.get("BACKEND_INTERNAL_URL", "http://backend:8000").rstrip("/")
    user_id = os.environ.get("EVAL_USER_ID")
    secret = os.environ.get("AGENT_SERVICE_TOKEN")
    if not user_id or not secret or not os.environ.get("EVAL_PROJECT_ID"):
        return EvalReport(
            status="failed",
            mode="live",
            backend_url=base_url,
            datasets=len(cases),
            passed=0,
            failed=len(cases),
            score=0.0,
            threshold=threshold,
            failures=["EVAL_USER_ID / EVAL_PROJECT_ID / AGENT_SERVICE_TOKEN required for live mode"],
            note="Live mode misconfigured.",
        )

    with httpx.Client(timeout=30.0) as client:
        return evaluate(
            cases,
            lambda case: _run_case(client, base_url, user_id, secret, case),
            threshold=threshold,
            mode="live",
            backend_url=base_url,
        )
