"""Deterministic evaluation datasets and checks (Stage 5).

Offline-first: each case carries a recorded structured output so the harness
runs deterministically in CI without a live model. Live mode fetches outputs
from the backend runtime (see ``runner.run_live``).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class EvalCase:
    """One agent evaluation case: inputs plus a recorded structured output."""

    id: str
    agent: str
    input: dict[str, Any]
    expected: dict[str, Any]
    checks: list[str] = field(default_factory=list)


# ── Deterministic checks ────────────────────────────────────────────────
# Each check receives (expected, actual) and returns a list of failure strings.

Check = Callable[[dict[str, Any], dict[str, Any]], list[str]]


def _require_keys(keys: list[str]) -> Check:
    def check(_expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
        return [f"missing key: {key}" for key in keys if key not in actual]

    return check


def _min_list_length(key: str, minimum: int) -> Check:
    def check(_expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
        value = actual.get(key)
        if not isinstance(value, list) or len(value) < minimum:
            return [f"{key} must have >= {minimum} items"]
        return []

    return check


def _scores_in_range(list_key: str, score_keys: list[str], low: int, high: int) -> Check:
    def check(_expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
        failures: list[str] = []
        for item in actual.get(list_key, []) or []:
            if not isinstance(item, dict):
                failures.append(f"{list_key} item is not an object")
                continue
            for key in score_keys:
                score = item.get(key)
                if not isinstance(score, (int, float)) or not (low <= score <= high):
                    failures.append(f"{list_key}.{key} out of range [{low}, {high}]")
        return failures

    return check


CHECKS: dict[str, Check] = {
    "topic.three": _min_list_length("topics", 3),
    "topic.scores": _scores_in_range("topics", ["novelty", "value", "feasibility"], 1, 10),
    "litreview.papers": _min_list_length("papers", 1),
    "design.feasibility": _require_keys(["feasibility", "hypotheses"]),
    "write.references": _require_keys(["references", "section"]),
    "submit.journals": _min_list_length("journals", 3),
    "rebuttal.responses": _min_list_length("responses", 1),
}


def run_checks(case: EvalCase, actual: dict[str, Any]) -> list[str]:
    """Run a case's named checks against an actual structured output."""
    failures: list[str] = []
    for name in case.checks:
        check = CHECKS.get(name)
        if check is None:
            failures.append(f"unknown check: {name}")
            continue
        failures.extend(check(case.expected, actual))
    return failures


def _topic_sample() -> dict[str, Any]:
    return {
        "topics": [
            {"title": f"Topic {i}", "gap": "gap", "novelty": 7, "value": 7, "feasibility": 7, "rationale": "r"}
            for i in range(1, 4)
        ]
    }


DATASETS: list[EvalCase] = [
    EvalCase(
        id="topic-basic",
        agent="topic",
        input={"analysisMode": "discovery", "discipline": "CS", "keywords": ["ai"]},
        expected={"topics": 3},
        checks=["topic.three", "topic.scores"],
    ),
    EvalCase(
        id="litreview-basic",
        agent="litreview",
        input={"query": "graphene", "maxResults": 5},
        expected={"papers": 1},
        checks=["litreview.papers"],
    ),
    EvalCase(
        id="design-basic",
        agent="design",
        input={"researchQuestion": "Does X affect Y?"},
        expected={"feasibility": True, "hypotheses": True},
        checks=["design.feasibility"],
    ),
    EvalCase(
        id="write-basic",
        agent="write",
        input={"section": "introduction", "citationStyle": "APA"},
        expected={"references": True, "section": True},
        checks=["write.references"],
    ),
    EvalCase(
        id="submit-basic",
        agent="submit",
        input={"abstract": "An abstract", "keywords": ["ai"]},
        expected={"journals": 3},
        checks=["submit.journals"],
    ),
    EvalCase(
        id="rebuttal-basic",
        agent="rebuttal",
        input={"reviewerComments": "Expand methods."},
        expected={"responses": 1},
        checks=["rebuttal.responses"],
    ),
]


def recorded_output(case: EvalCase) -> dict[str, Any]:
    """Deterministic recorded output for a case (offline mode)."""
    if case.agent == "topic":
        return _topic_sample()
    if case.agent == "litreview":
        return {"papers": [{"title": "Paper", "authors": ["A"], "year": 2024}], "themes": ["t"], "gaps": ["g"]}
    if case.agent == "design":
        return {"feasibility": {"score": 7, "factors": [{"name": "Data", "score": 8}]}, "hypotheses": ["H1"]}
    if case.agent == "data":
        return {"scripts": [{"language": "python", "code": "print(1)"}]}
    if case.agent == "write":
        return {"references": [{"key": "smith2024"}], "section": "introduction", "wordCount": 100}
    if case.agent == "submit":
        return {"journals": [{"name": f"J{i}", "fitScore": 80} for i in range(3)], "checklist": ["c"]}
    if case.agent == "rebuttal":
        return {"responses": [{"commentNumber": 1, "comment": "c", "response": "r"}]}
    return {}
