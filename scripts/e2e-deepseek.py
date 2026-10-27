"""End-to-end model verification: desktop ApiClient -> local backend -> DeepSeek API.

Creates a project/thread/run through the same API the desktop app uses and
asserts the run output came from the real DeepSeek model (not the fake one).

Run: PYTHONPATH=desktop/src python3 scripts/e2e-deepseek.py [base_url]
"""

from __future__ import annotations

import json
import sys
import time
import uuid

from ischolar_desktop.api import ApiClient, ApiError

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
EMAIL = "e2e-staff@ischolar.test"
PASSWORD = "TestPass1"
AGENT = "litreview"
GOAL = "Summarize the methodological trends in reproducible research, in two sentences."
# FakeModel output marker — its presence means the model never reached DeepSeek.
FAKE_MARKER = "deterministic fake model"

# litreview runs several tool rounds (crossref search) + DeepSeek calls.
TIMEOUT_SECONDS = 600
# Terminal statuses for a run that reached the model successfully;
# `waiting_for_review` means the artifact awaits human review, not a failure.
OK_STATUSES = {"succeeded", "waiting_for_review", "waiting_approval"}
FAIL_STATUSES = {"failed", "cancelled"}


def artifact_text(content: object) -> str:
    """Extract readable text from an artifact's `content`.

    Over HTTP the desktop client's JSON parsing yields a dict (`{"text": ...,
    "structured": ...}`); a raw string may still arrive as JSON text.
    """
    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str) and text:
            return text
        structured = content.get("structured")
        return json.dumps(structured, ensure_ascii=False, indent=2) if structured else ""
    if isinstance(content, str) and content.startswith("{"):
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return content
        if isinstance(parsed, dict) and isinstance(parsed.get("text"), str):
            return parsed["text"]
        return json.dumps(parsed, ensure_ascii=False, indent=2)
    return str(content or "")


def main() -> int:
    api = ApiClient(BASE)
    user = api.login(EMAIL, PASSWORD)
    print(f"[ok] login as {user.get('email')}")

    suffix = uuid.uuid4().hex[:8]
    project = api.request(
        "/api/data/projects",
        method="POST",
        payload={"name": f"DeepSeek E2E {suffix}", "description": "End-to-end model verification"},
    )
    project_id = project["id"]
    print(f"[ok] created project {project_id}")

    thread = api.request(
        "/api/agent/threads",
        method="POST",
        payload={"projectId": project_id, "title": f"DeepSeek E2E {suffix}"},
    )
    run = api.request(
        "/api/agent/runs",
        method="POST",
        payload={
            "threadId": thread["id"],
            "projectId": project_id,
            "agent": AGENT,
            "goal": GOAL,
            "input": {"query": GOAL, "researchGoal": GOAL},
        },
    )
    run_id = run["id"]
    print(f"[ok] created run {run_id} status={run['status']}")

    started = time.time()
    deadline = started + TIMEOUT_SECONDS
    final = run
    while time.time() < deadline:
        final = api.request(f"/api/agent/runs/{run_id}")
        if final["status"] in OK_STATUSES | FAIL_STATUSES:
            break
        time.sleep(3)

    status = final["status"]
    print(f"[*] final status: {status} after {time.time() - started:.0f}s")
    if status in FAIL_STATUSES:
        print(f"[FAIL] run ended as {status}: {final.get('error')}")
        return 1
    if status not in OK_STATUSES:
        print(f"[FAIL] run still {status} after {TIMEOUT_SECONDS}s (worker running?)")
        return 1

    # Gather every place model output can appear.
    chunks = [str(final.get("result") or "")]
    for artifact in final.get("artifacts") or []:
        chunks.append(artifact_text(artifact.get("content")))
    combined = "\n".join(chunks)

    if not combined.strip():
        print("[FAIL] run finished but produced no output text")
        return 1
    if FAKE_MARKER in combined:
        print(f"[FAIL] output came from FakeModel, not DeepSeek: {combined[:300]}")
        return 1

    print(f"[ok] output length={len(combined)} chars")
    print("----- output preview -----")
    print(combined[:600])
    print("--------------------------")
    print("\nAll DeepSeek end-to-end checks passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ApiError as exc:
        print(f"[FAIL] API error: {exc}")
        raise SystemExit(1)
