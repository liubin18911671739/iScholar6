"""Shared builder for the seven per-agent research graphs."""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from sqlalchemy import select

from app.agents.harness import AgentHarness
from app.agents.model import (
    AgentModel,
    ModelMessage,
    ModelResult,
    ToolSpec,
    get_model,
)
from app.agents.prompts import SYSTEM_PROMPTS, build_user_prompt
from app.models import Artifact

# Bounded model tool loop: how many tool rounds a draft may take before the
# model is forced to answer. The harness separately enforces the call budget.
MAX_TOOL_STEPS = 3


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
    # Training (coach) linkage, carried through the run.
    training_task_id: str | None
    program_id: str | None
    mode: str | None
    submission_id: str | None


@dataclass
class AgentGraphConfig:
    """Per-agent graph wiring."""

    agent: str
    artifact_kind: str
    allowed_tools: list[str] = field(default_factory=list)
    context_kinds: list[str] = field(default_factory=list)
    max_context_chars: int = 1000


def build_tool_specs(
    names: Iterable[str],
    plugin_tools: dict[str, Any] | None = None,
    remote_tools: dict[str, Any] | None = None,
) -> list[ToolSpec]:
    """Resolve allow-listed tool names (registry + owner plugin + remote MCP)."""
    from app.mcp.registry import registry

    specs: list[ToolSpec] = []
    for name in sorted(names):
        tool = registry.get(name)
        if tool is not None:
            specs.append(
                ToolSpec(name=tool.name, description=tool.description, parameters=tool.params_model.model_json_schema())
            )
        elif plugin_tools and name in plugin_tools:
            definition = plugin_tools[name]
            specs.append(ToolSpec(name=definition.name, description=definition.description, parameters=definition.parameters))
        elif remote_tools and name in remote_tools:
            definition = remote_tools[name]
            specs.append(
                ToolSpec(name=definition.name, description=definition.description, parameters=definition.parameters)
            )
    return specs


def _compact(value: Any, limit: int = 1500) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except TypeError:
        text = str(value)
    return text[:limit]


async def run_agent_draft(
    harness: AgentHarness,
    model: AgentModel,
    system: str,
    user: str,
    tool_names: Iterable[str],
) -> tuple[ModelResult, list[dict[str, Any]]]:
    """Produce a draft: let the model call allow-listed tools, then answer.

    Tool execution goes through the harness (budget + allow-list + events).
    Tool results round-trip as proper tool-role messages (id-bound) so the
    provider sees a real tool-calling conversation. The answer is streamed as
    ``message.delta`` events; usage accrues against the run token budget.
    """
    specs = build_tool_specs(
        tool_names,
        getattr(harness, "plugin_tools", None),
        getattr(harness, "remote_tools", None),
    )
    if not specs:
        result = await harness.stream_model(model, system, user)
        return result, []

    messages: list[ModelMessage] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    tool_results: list[dict[str, Any]] = []
    final: ModelResult | None = None
    for _step in range(MAX_TOOL_STEPS):
        await harness.check_model_budget()
        decision = await model.generate_messages(messages, tools=specs)
        harness.record_usage(decision.token_in, decision.token_out)
        if not decision.tool_calls:
            final = decision
            break
        messages.append(
            {
                "role": "assistant",
                "content": decision.text,
                "tool_calls": [
                    {"id": call.id or call.name, "name": call.name, "arguments": call.arguments}
                    for call in decision.tool_calls
                ],
            }
        )
        for call in decision.tool_calls:
            try:
                output = await harness.call_tool(call.name, **(call.arguments or {}))
            except Exception as exc:  # Tool failures are surfaced to the model.
                output = {"error": str(exc)}
            if isinstance(output, list):
                tool_results.extend(item for item in output if isinstance(item, dict))
            messages.append(
                {"role": "tool", "tool_call_id": call.id or call.name, "name": call.name, "content": _compact(output)}
            )
    if final is None:
        await harness.check_model_budget()
        final = await model.generate_messages(messages, tools=specs)
        harness.record_usage(final.token_in, final.token_out)

    evidence = [item for item in tool_results if item.get("title") and item.get("url")]
    if evidence:
        await harness.persist_evidence(evidence)
    await harness.emit_text_deltas(final.text)
    return final, tool_results


async def finalize_structured(
    harness: AgentHarness, model: AgentModel, agent: str, system: str, result: ModelResult
) -> dict[str, Any] | None:
    """Parse the structured output; on failure, ask the model once to repair it.

    Repair is a budgeted single retry with the model's own draft as feedback —
    never a silent silent None-only path in structured pipelines.
    """
    from app.agents.schemas import output_schema, parse_agent_output

    structured = parse_agent_output(agent, result.text)
    if structured is not None or output_schema(agent) is None:
        return structured
    await harness.check_model_budget()
    prior = json.dumps({"draft": result.text[:3000]}, ensure_ascii=False)
    repair_prompt = (
        "Your previous answer's final ```json block was missing or invalid. "
        f"Previous answer (truncated): {prior}\n\n"
        "Reply again with the corrected output: readable markdown is allowed, "
        "but it must end with exactly one valid ```json block matching the "
        "required schema."
    )
    repair = await model.generate_messages(
        [{"role": "system", "content": system}, {"role": "user", "content": repair_prompt}]
    )
    harness.record_usage(repair.token_in, repair.token_out)
    structured = parse_agent_output(agent, repair.text)
    if structured is not None:
        await harness.emit("schema.repaired", {"agent": agent})
    return structured


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
    """Build a plan → context → draft (model-driven tools) → review graph."""

    async def plan(state: AgentState) -> dict[str, Any]:
        await harness.emit("plan.created", {"agent": config.agent, "goal": state["goal"]})
        return {}

    async def gather_context(state: AgentState) -> dict[str, Any]:
        context = await _build_context(
            harness, state["project_id"], config.context_kinds, config.max_context_chars
        )
        return {"context": context}

    async def draft(state: AgentState) -> dict[str, Any]:
        model = get_model(config.agent)
        agent_input = state.get("input", {}) or {}
        # Client-resolved prompts (plugin packs, locale, context) win over defaults.
        system = agent_input.get("systemPrompt") or SYSTEM_PROMPTS[config.agent]
        language = str(agent_input.get("language") or "auto").lower()
        if language == "auto":
            source = " ".join(
                [str(state.get("goal") or ""), *(str(agent_input.get(key) or "") for key in ("researchGoal", "query", "researchQuestion", "abstract", "reviewerComments", "dataSource"))]
            )
            language = "zh" if any("\u3400" <= char <= "\u9fff" for char in source) else "en"
        if language.startswith("zh"):
            system = "重要提示：所有回复必须使用中文。\n\n" + system
        elif language.startswith("en"):
            system = "Important: write all responses in English.\n\n" + system
        user = agent_input.get("userPrompt") or build_user_prompt(
            config.agent, agent_input, state.get("context", "")
        )
        result, tool_results = await run_agent_draft(harness, model, system, user, config.allowed_tools)
        structured = await finalize_structured(harness, model, config.agent, system, result)
        content: dict[str, Any] = {
            "text": result.text,
            "structured": structured,
            "sources": tool_results,
            "usage": {"tokenIn": harness.token_in, "tokenOut": harness.token_out},
        }
        artifact = await harness.save_draft(state["project_id"], config.artifact_kind, content)
        return {
            "draft": {**content, "artifactId": str(artifact.id)},
            "structured": structured,
            "tool_results": tool_results,
        }

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
    builder.add_node("draft", draft)
    builder.add_node("review", review)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "context")
    builder.add_edge("context", "draft")
    builder.add_edge("draft", "review")
    builder.add_edge("review", END)
    return builder


def build_generic_graph(
    agent: str,
    artifact_kind: str,
    system_default: str,
    harness: AgentHarness,
    *,
    allowed_tools: list[str] | None = None,
):
    """Plan → draft → review graph for coach/plugin agents.

    Prompts come from the client-resolved ``input`` (plugin packs, locale,
    context); there is no per-agent schema, so the artifact stores raw text.
    """

    async def plan(state: AgentState) -> dict[str, Any]:
        await harness.emit("plan.created", {"agent": agent, "goal": state["goal"]})
        return {}

    async def draft(state: AgentState) -> dict[str, Any]:
        model = get_model(agent)
        agent_input = state.get("input", {}) or {}
        system = agent_input.get("systemPrompt") or system_default
        user = agent_input.get("userPrompt") or state["goal"]
        context = state.get("context", "")
        if context:
            user = f"{user}\n\n{context}"
        result, tool_results = await run_agent_draft(harness, model, system, user, allowed_tools or [])
        content: dict[str, Any] = {
            "text": result.text,
            "sources": tool_results,
            "usage": {"tokenIn": harness.token_in, "tokenOut": harness.token_out},
        }
        artifact = await harness.save_draft(state["project_id"], artifact_kind, content)
        return {"draft": {**content, "artifactId": str(artifact.id)}}

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
    builder.add_node("draft", draft)
    builder.add_node("review", review)
    builder.add_edge(START, "plan")
    builder.add_edge("plan", "draft")
    builder.add_edge("draft", "review")
    builder.add_edge("review", END)
    return builder
