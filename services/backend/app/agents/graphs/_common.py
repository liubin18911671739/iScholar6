"""Shared builder for the seven per-agent research graphs."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from sqlalchemy import select

from app.agents.harness import AgentHarness
from app.agents.model import get_model
from app.agents.prompts import SYSTEM_PROMPTS, build_user_prompt
from app.agents.schemas import parse_agent_output
from app.models import Artifact


class AgentState(TypedDict, total=False):
    goal: str
    project_id: str
    agent: str
    input: dict[str, Any]
    context: str
    tool_results: list[dict[str, Any]]
    draft: dict[str, Any]
    structured: dict[str, Any] | None
    approval: dict[str, Any]


@dataclass
class AgentGraphConfig:
    """Per-agent graph wiring."""

    agent: str
    artifact_kind: str
    allowed_tools: list[str] = field(default_factory=list)
    context_kinds: list[str] = field(default_factory=list)
    max_context_chars: int = 1000


async def _build_context(harness: AgentHarness, project_id: str, kinds: list[str], max_chars: int) -> str:
    """Inject the caller's latest approved artifact(s) per upstream kind."""
    if not kinds:
        return ""
    context = ""
    for kind in kinds:
        artifact = await harness.session.scalar(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.kind == kind, Artifact.status == "approved")
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        if not artifact:
            continue
        content = artifact.content or {}
        text = content.get("text") if isinstance(content, dict) else None
        if isinstance(text, str) and text.strip():
            context += f"\nContext from previous {kind} analysis:\n{text[:max_chars]}\n"
    return context


def build_agent_graph(config: AgentGraphConfig, harness: AgentHarness):
    """Build a plan → context → research → draft → review graph for one agent."""

    async def plan(state: AgentState) -> dict[str, Any]:
        await harness.emit("plan.created", {"agent": config.agent, "goal": state["goal"]})
        return {}

    async def gather_context(state: AgentState) -> dict[str, Any]:
        context = await _build_context(
            harness, state["project_id"], config.context_kinds, config.max_context_chars
        )
        return {"context": context}

    async def research(state: AgentState) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        for tool in config.allowed_tools:
            arguments = {"query": state["goal"]} if tool == "scholar.search" else {"projectId": state["project_id"]}
            try:
                output = await harness.call_tool(tool, **arguments)
            except Exception:
                output = []
            if isinstance(output, list):
                results.extend(output)
        if results:
            await harness.persist_evidence(
                [item for item in results if isinstance(item, dict) and item.get("title") and item.get("url")]
            )
        return {"tool_results": results}

    async def draft(state: AgentState) -> dict[str, Any]:
        model = get_model(config.agent)
        system = SYSTEM_PROMPTS[config.agent]
        user = build_user_prompt(config.agent, state.get("input", {}), state.get("context", ""))
        result = await model.generate(system, user)
        structured = parse_agent_output(config.agent, result.text)
        content: dict[str, Any] = {
            "text": result.text,
            "structured": structured,
            "sources": state.get("tool_results", []),
            "usage": {"tokenIn": result.token_in, "tokenOut": result.token_out},
        }
        artifact = await harness.save_draft(state["project_id"], config.artifact_kind, content)
        return {"draft": {**content, "artifactId": str(artifact.id)}, "structured": structured}

    async def review(state: AgentState) -> dict[str, Any]:
        decision = interrupt(
            {
                "kind": "artifact_review",
                "artifact": state["draft"],
                "message": "Review and approve the draft before publishing it.",
            }
        )
        return {"approval": decision}

    builder = StateGraph(AgentState)
    builder.add_node("plan", plan)
    builder.add_node("context", gather_context)
    builder.add_node("research", research)
    builder.add_node("draft", draft)
    builder.add_node("review", review)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "context")
    builder.add_edge("context", "research")
    builder.add_edge("research", "draft")
    builder.add_edge("draft", "review")
    builder.add_edge("review", END)
    return builder
