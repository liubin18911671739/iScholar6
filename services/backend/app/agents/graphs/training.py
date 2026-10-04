"""Training (coach) conversational graph — checkpointed, multi-turn.

The coach is a conversational graph: each run appends the new learner turn and
the model reply to the thread's checkpointed ``messages`` (via the
``add_messages`` reducer), so reusing the same ``thread_id`` yields a durable
multi-turn conversation. Replies stream as ``message.delta`` events and are
returned in ``draft.text`` (no artifact is written, matching Hermes).
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.agents.harness import AgentHarness
from app.agents.model import AgentModel, get_model

COACH_SYSTEM_PROMPT = (
    "You are the iScholar AI research coach. Guide the learner through the "
    "current training task with concise, actionable, discipline-aware advice. "
    "Respond in the language the learner uses."
)


class CoachState(TypedDict, total=False):
    goal: str
    project_id: str
    agent: str
    input: dict[str, Any]
    messages: Annotated[list[BaseMessage], add_messages]
    draft: dict[str, Any]


def _to_messages(raw: Any) -> list[BaseMessage]:
    """Convert client-supplied ``{role, content}`` dicts into langchain messages."""
    messages: list[BaseMessage] = []
    if not isinstance(raw, list):
        return messages
    for item in raw:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or "")
        role = str(item.get("role") or "user")
        if role == "assistant":
            messages.append(AIMessage(content=content))
        elif role == "system":
            messages.append(SystemMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    return messages


def conversation_text(messages: list[BaseMessage]) -> str:
    """Serialize a conversation for the single-string model interface."""
    lines: list[str] = []
    for message in messages:
        role = "assistant" if isinstance(message, AIMessage) else ("system" if isinstance(message, SystemMessage) else "user")
        lines.append(f"{role}: {getattr(message, 'content', '')}")
    return "\n".join(lines)


def build(harness: AgentHarness, model: AgentModel | None = None):
    """Build the checkpointed coach conversation graph."""

    async def chat(state: CoachState) -> dict[str, Any]:
        agent_input = state.get("input", {}) or {}
        system = agent_input.get("systemPrompt") or COACH_SYSTEM_PROMPT
        history = list(state.get("messages", []))
        incoming = _to_messages(agent_input.get("messages"))
        if not incoming:
            content = agent_input.get("userPrompt") or state.get("goal", "")
            incoming = [HumanMessage(content=str(content))]
        model_impl = model or get_model("coach")
        result = await harness.stream_model(model_impl, system, conversation_text(history + incoming))
        reply = AIMessage(content=result.text)
        return {
            "messages": [*incoming, reply],
            "draft": {"text": result.text, "usage": {"tokenIn": result.token_in, "tokenOut": result.token_out}},
        }

    builder = StateGraph(CoachState)
    builder.add_node("chat", chat)
    builder.add_edge(START, "chat")
    builder.add_edge("chat", END)
    return builder
