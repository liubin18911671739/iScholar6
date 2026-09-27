"""Hermes conversational graph (module assistant).

A single-node conversational graph: the caller passes ``input.messages`` and the
model replies. No artifact/interrupt — the run result carries the reply text.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.graphs._common import AgentGraphConfig
from app.agents.harness import AgentHarness
from app.agents.model import get_model
from app.agents.prompts import build_hermes_system_prompt


class HermesState(TypedDict, total=False):
    goal: str
    project_id: str
    agent: str
    input: dict[str, Any]
    draft: dict[str, Any]


CONFIG = AgentGraphConfig(agent="hermes", artifact_kind="hermes_reply", allowed_tools=[], context_kinds=[])


def build(harness: AgentHarness):
    """Build the conversational Hermes graph."""

    async def chat(state: HermesState) -> dict[str, Any]:
        await harness.emit("hermes.chat.started", {"module": state.get("agent")})
        messages = state.get("input", {}).get("messages", [])
        system = build_hermes_system_prompt(state.get("agent", "topic"))
        user = (
            "\n".join(
                f"{message.get('role')}: {message.get('content')}"
                for message in messages
                if isinstance(message, dict)
            )
            or state.get("goal", "")
        )
        result = await get_model("hermes").generate(system, user)
        await harness.emit("hermes.chat.completed", {})
        return {"draft": {"text": result.text, "usage": {"tokenIn": result.token_in, "tokenOut": result.token_out}}}

    builder = StateGraph(HermesState)
    builder.add_node("chat", chat)
    builder.add_edge(START, "chat")
    builder.add_edge("chat", END)
    return builder
