"""Per-agent structured-output schemas and parser.

Port of ``lib/ai/parse-agent-output.ts``: extract the last ```json fence and
validate it against the agent's Pydantic model. Parsing is best-effort and
returns ``None`` on any mismatch.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field

_JSON_FENCE = re.compile(r"```json\s*\n([\s\S]*?)\n```")


class TopicItem(BaseModel):
    title: str
    gap: str
    novelty: int
    value: int
    feasibility: int
    rationale: str


class TopicOutput(BaseModel):
    topics: list[TopicItem]


class LitPaper(BaseModel):
    title: str
    authors: list[str] | None = None
    year: int | None = None
    venue: str | None = None
    method: str | None = None
    findings: str | None = None
    doi: str | None = None


class LitReviewOutput(BaseModel):
    papers: list[LitPaper]
    themes: list[str] | None = None
    gaps: list[str] | None = None


class FeasibilityFactor(BaseModel):
    name: str
    score: int
    note: str | None = None


class Feasibility(BaseModel):
    score: int
    factors: list[FeasibilityFactor] = Field(default_factory=list)


class DesignVariables(BaseModel):
    independent: list[str] | None = None
    dependent: list[str] | None = None
    mediators: list[str] | None = None
    moderators: list[str] | None = None


class DesignOutput(BaseModel):
    feasibility: Feasibility
    hypotheses: list[str] | None = None
    variables: DesignVariables | None = None


class DataScript(BaseModel):
    language: str
    filename: str | None = None
    code: str


class DataOutput(BaseModel):
    scripts: list[DataScript]
    recommendations: list[str] | None = None
    analysisPlan: list[str] | None = None


class WriteReference(BaseModel):
    key: str
    authors: str | None = None
    title: str | None = None
    year: int | None = None
    venue: str | None = None
    doi: str | None = None


class WriteOutput(BaseModel):
    references: list[WriteReference]
    section: str | None = None
    wordCount: int | None = None


class SubmitJournal(BaseModel):
    name: str
    fitScore: float
    impactFactor: float | None = None
    reviewTimeline: str | None = None
    openAccess: bool | None = None
    rationale: str | None = None


class SubmitOutput(BaseModel):
    journals: list[SubmitJournal]
    checklist: list[str] | None = None


class RebuttalItem(BaseModel):
    commentNumber: int
    comment: str
    response: str
    changeLocation: str | None = None
    evidence: str | None = None


class RebuttalOutput(BaseModel):
    responses: list[RebuttalItem]


SCHEMAS: dict[str, type[BaseModel]] = {
    "topic": TopicOutput,
    "litreview": LitReviewOutput,
    "design": DesignOutput,
    "data": DataOutput,
    "write": WriteOutput,
    "submit": SubmitOutput,
    "rebuttal": RebuttalOutput,
}


def parse_agent_output(agent: str, text: str) -> dict[str, Any] | None:
    """Extract and validate the last JSON fence; return a dict or None."""
    schema = SCHEMAS.get(agent)
    if schema is None:
        return None
    matches = _JSON_FENCE.findall(text or "")
    if not matches:
        return None
    try:
        parsed = json.loads(matches[-1].strip())
    except (ValueError, TypeError):
        return None
    try:
        return schema.model_validate(parsed).model_dump(by_alias=True, exclude_none=True)
    except Exception:
        return None
