"""Legacy-vs-new parity harness (fixture-based).

Recorded legacy contracts (user-prompt substrings + structured-output shapes)
are asserted against the new Python prompt assembly and parser. Live legacy
comparison is intentionally out of scope for the default suite.
"""

from __future__ import annotations

import pytest

from app.agents.prompts import build_user_prompt
from app.agents.schemas import parse_agent_output

# (agent, input, substrings the legacy user prompt must contain)
PARITY_PROMPTS = [
    ("topic", {"analysisMode": "discovery", "discipline": "CS", "keywords": ["ai", "ml"]}, ["research opportunities", "CS", "ai, ml"]),
    ("topic", {"analysisMode": "literature", "discipline": "CS", "keywords": ["ai"]}, ["literature-focused topic analysis"]),
    ("topic", {"analysisMode": "trends", "discipline": "CS", "keywords": ["ai"]}, ["research trend analysis"]),
    ("litreview", {"query": "graphene", "yearFrom": 2015, "yearTo": 2024, "maxResults": 30}, ["literature review", "graphene", "2015", "2024", "30"]),
    ("design", {"researchQuestion": "Q?", "methodology": "RCT"}, ["Design a research study", "Q?", "RCT"]),
    ("data", {"dataSource": "csv", "collectionMethod": "survey"}, ["data analysis", "csv", "survey"]),
    ("write", {"section": "methods", "citationStyle": "APA"}, ["methods", "APA", "IMRaD"]),
    ("submit", {"abstract": "abs", "keywords": "ai", "openAccess": True}, ["Match this paper", "abs", "ai", "yes"]),
    ("rebuttal", {"reviewerComments": "expand"}, ["point-by-point", "expand"]),
]

# (agent, legacy structured output) — must parse identically in Python.
PARITY_OUTPUTS = {
    "topic": {"topics": [{"title": "T", "gap": "G", "novelty": 8, "value": 7, "feasibility": 6, "rationale": "R"}]},
    "litreview": {"papers": [{"title": "P", "authors": ["A"], "year": 2024}], "themes": ["t"], "gaps": ["g"]},
    "design": {"feasibility": {"score": 7, "factors": [{"name": "Data", "score": 8}]}, "hypotheses": ["H1"]},
    "data": {"scripts": [{"language": "python", "code": "print(1)"}], "recommendations": ["r"]},
    "write": {"references": [{"key": "smith2024"}], "section": "introduction", "wordCount": 120},
    "submit": {"journals": [{"name": "J", "fitScore": 85}], "checklist": ["c"]},
    "rebuttal": {"responses": [{"commentNumber": 1, "comment": "c", "response": "r"}]},
}


@pytest.mark.parametrize(("agent", "payload", "substrings"), PARITY_PROMPTS)
def test_user_prompt_parity(agent: str, payload: dict, substrings: list[str]) -> None:
    prompt = build_user_prompt(agent, payload)
    for substring in substrings:
        assert substring in prompt, f"{agent}: missing {substring!r}"


@pytest.mark.parametrize(("agent", "payload"), list(PARITY_OUTPUTS.items()))
def test_structured_output_parity(agent: str, payload: dict) -> None:
    import json

    text = f"markdown\n```json\n{json.dumps(payload)}\n```"
    parsed = parse_agent_output(agent, text)
    assert parsed is not None
    assert set(payload) <= set(parsed)
