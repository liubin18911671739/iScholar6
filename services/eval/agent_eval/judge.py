"""Optional LLM judge for evaluation (Stage 5).

Disabled unless ``EVAL_JUDGE=true`` and ``DEEPSEEK_API_KEY`` is set, so the
default offline run stays deterministic. The judge scores a structured output
against the case's agent using a pinned model and temperature.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx

JUDGE_MODEL = "deepseek-chat"
JUDGE_TEMPERATURE = 0.0


@dataclass(frozen=True)
class JudgeResult:
    score: float
    rationale: str


def judge_enabled() -> bool:
    """True when the judge is explicitly enabled and configured."""
    return os.environ.get("EVAL_JUDGE", "false").lower() == "true" and bool(os.environ.get("DEEPSEEK_API_KEY"))


def judge_case(agent: str, actual: dict[str, Any], *, timeout: float = 30.0) -> JudgeResult | None:
    """Score one structured output with the LLM judge, or return None when disabled."""
    if not judge_enabled():
        return None

    api_url = os.environ.get("DEEPSEEK_API_URL", "https://api.deepseek.com").rstrip("/")
    prompt = (
        f"You are grading the output of the '{agent}' research agent. "
        "Score 0-100 for correctness, completeness, and adherence to the requested structure. "
        'Respond with JSON only: {"score": <number>, "rationale": "<short>"}.\n\n'
        f"Output:\n{json.dumps(actual, ensure_ascii=False)}"
    )
    response = httpx.post(
        f"{api_url}/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['DEEPSEEK_API_KEY']}", "Content-Type": "application/json"},
        json={
            "model": JUDGE_MODEL,
            "temperature": JUDGE_TEMPERATURE,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=timeout,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(content)
        return JudgeResult(score=float(parsed["score"]), rationale=str(parsed.get("rationale", "")))
    except (ValueError, KeyError, TypeError):
        return None
