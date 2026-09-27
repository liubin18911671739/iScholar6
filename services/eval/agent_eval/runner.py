"""Evaluation runner.

Offline (default) scores deterministic recorded outputs against per-agent
checks. Live mode (``EVAL_MODE=live``) drives the backend runtime over HTTP.
Emits a JSON report and returns a non-zero exit code when the score is below
``EVAL_THRESHOLD`` (default 0.8).
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import Any

from agent_eval.datasets import DATASETS, EvalCase, recorded_output, run_checks
from agent_eval.judge import judge_case, judge_enabled

DEFAULT_THRESHOLD = 0.8


@dataclass(frozen=True)
class EvalReport:
    """Summary emitted to stdout / CI artifacts."""

    status: str
    mode: str
    backend_url: str
    datasets: int
    passed: int
    failed: int
    score: float
    threshold: float
    failures: list[str] = field(default_factory=list)
    judge_score: float | None = None
    note: str = ""


def evaluate(
    cases: list[EvalCase],
    get_output: Callable[[EvalCase], dict[str, Any]],
    *,
    threshold: float = DEFAULT_THRESHOLD,
    mode: str = "offline",
    backend_url: str = "",
) -> EvalReport:
    """Score every case and assemble the report."""
    passed = 0
    failures: list[str] = []
    judge_scores: list[float] = []
    for case in cases:
        try:
            actual = get_output(case)
        except Exception as exc:  # noqa: BLE001 - surface any runner failure as a case failure
            failures.append(f"{case.id}: runner error: {exc}")
            continue
        case_failures = run_checks(case, actual)
        if case_failures:
            failures.extend(f"{case.id}: {message}" for message in case_failures)
        else:
            passed += 1
        if judge_enabled():
            judged = judge_case(case.agent, actual)
            if judged is not None:
                judge_scores.append(judged.score)

    total = len(cases)
    score = 0.0 if total == 0 else round(passed / total, 3)
    judge_score = round(sum(judge_scores) / len(judge_scores), 1) if judge_scores else None
    return EvalReport(
        status="passed" if score >= threshold else "failed",
        mode=mode,
        backend_url=backend_url,
        datasets=total,
        passed=passed,
        failed=total - passed,
        score=score,
        threshold=threshold,
        failures=failures,
        judge_score=judge_score,
        note="Offline deterministic checks. Set EVAL_MODE=live for backend runs.",
    )


def build_report(threshold: float = DEFAULT_THRESHOLD) -> EvalReport:
    """Offline report over recorded outputs (deterministic, no network)."""
    return evaluate(DATASETS, recorded_output, threshold=threshold, mode="offline")


def main() -> int:
    """Print the JSON report and return a process exit code."""
    threshold = float(os.environ.get("EVAL_THRESHOLD", DEFAULT_THRESHOLD))
    mode = os.environ.get("EVAL_MODE", "offline")
    if mode == "live":
        from agent_eval.live import run_live

        report = run_live(threshold=threshold)
    else:
        report = build_report(threshold=threshold)
    print(json.dumps(asdict(report), indent=2, ensure_ascii=False))
    return 0 if report.status == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
