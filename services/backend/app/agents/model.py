"""Agent model abstraction: deterministic fake + DeepSeek.

Graphs call ``get_model(agent)``. Tests and CI use the deterministic
``FakeModel`` (no network); production uses DeepSeek via ``langchain-openai``
when ``DEEPSEEK_API_KEY`` is set and ``AGENT_MODEL_FAKE`` is not.

Models can (a) call allow-listed tools via ``bind_tools`` and (b) stream text
token-by-token. Tool execution stays in the harness — the model only *chooses*
a tool; graphs run it through :class:`~app.agents.harness.AgentHarness`.
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core.config import get_settings

# Marker appended to the prompt after a tool round so deterministic models know
# the loop already executed tools and should now produce the final answer.
TOOL_RESULT_MARKER = "[tool-results]"

_FAKE_PAYLOADS: dict[str, dict[str, Any]] = {
    "topic": {
        "topics": [
            {"title": f"Candidate {index}", "gap": "A gap", "novelty": 7, "value": 7, "feasibility": 7, "rationale": "Promising"}
            for index in range(1, 4)
        ]
    },
    "litreview": {
        "papers": [{"title": "Paper", "authors": ["A. Author"], "year": 2024, "venue": "Venue", "findings": "Finding"}],
        "themes": ["Theme"],
        "gaps": ["Gap"],
    },
    "design": {
        "feasibility": {"score": 7, "factors": [{"name": "Data Availability", "score": 8, "note": "ok"}]},
        "hypotheses": ["H1: ..."],
        "variables": {"independent": ["IV"], "dependent": ["DV"]},
    },
    "data": {
        "scripts": [{"language": "python", "filename": "collect.py", "code": "print('ok')"}],
        "recommendations": ["Recommendation"],
        "analysisPlan": ["Clean data"],
    },
    "write": {"references": [{"key": "smith2024", "title": "Paper", "year": 2024}], "section": "introduction", "wordCount": 120},
    "submit": {"journals": [{"name": "Journal", "fitScore": 85, "impactFactor": 4.2, "reviewTimeline": "6-8 weeks", "openAccess": True}], "checklist": ["Prepare cover letter"]},
    "rebuttal": {"responses": [{"commentNumber": 1, "comment": "Comment", "response": "Response", "changeLocation": "Methods"}]},
    # research-plan workflow roles (quality gate + plan synthesizer).
    "quality": {"verdict": "pass", "issues": []},
    "summary": {"researchQuestion": "RQ", "hypotheses": ["H1: ..."], "openMaterials": ["Ethics approval"]},
}


@dataclass(frozen=True)
class ToolSpec:
    """A tool the model may request, in a provider-neutral shape."""

    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    """A tool invocation requested by the model (executed by the harness)."""

    name: str
    arguments: dict[str, Any] = field(default_factory=dict)
    id: str = ""


@dataclass
class ModelResult:
    """Model output text plus token usage and any requested tool calls."""

    text: str
    token_in: int = 0
    token_out: int = 0
    tool_calls: list[ToolCall] = field(default_factory=list)


@dataclass
class StreamResult:
    """Aggregate of a streamed response (text + usage)."""

    text: str = ""
    token_in: int = 0
    token_out: int = 0


# Called for each streamed token; the graph uses it to emit ``message.delta``.
DeltaSink = Callable[[str], Awaitable[None]]

# Provider-neutral chat message shape used by the tool round-trip protocol:
# {"role": "system"|"user"|"assistant"|"tool", "content": str,
#  "tool_calls"?: [{"id", "name", "arguments"}], "tool_call_id"?: str}
ModelMessage = dict[str, Any]


class AgentModel(Protocol):
    """Async text-generation interface used by graph nodes."""

    async def generate(self, system: str, user: str, tools: list[ToolSpec] | None = None) -> ModelResult: ...

    async def generate_messages(
        self, messages: list[ModelMessage], tools: list[ToolSpec] | None = None
    ) -> ModelResult: ...

    async def stream(self, system: str, user: str, on_delta: DeltaSink) -> StreamResult: ...


def _chunk_text(text: str, size: int) -> list[str]:
    return [text[index : index + size] for index in range(0, len(text), size)] or [""]


def _openai_tool(spec: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters or {"type": "object", "properties": {}},
        },
    }


_WIRE_NAME_FORBIDDEN = re.compile(r"[^A-Za-z0-9_-]")


def _wire_tools(tools: list[ToolSpec]) -> tuple[list[ToolSpec], dict[str, str]]:
    """Rewrite tool names onto the OpenAI wire alphabet (``^[A-Za-z0-9_-]+$``).

    Registry names are namespaced with dots (``scholar.search``,
    ``mcp.<server>.<tool>``), which providers reject. Every tool gets a
    sanitized wire alias; ``aliases`` maps each wire name back to its original
    for model-returned tool calls and outgoing history echoes.
    """
    aliases: dict[str, str] = {}
    wire: list[ToolSpec] = []
    used: set[str] = set()
    for spec in tools:
        base = _WIRE_NAME_FORBIDDEN.sub("_", spec.name)
        safe, suffix = base, 1
        while safe in used:
            safe = f"{base}_{suffix}"
            suffix += 1
        used.add(safe)
        aliases[safe] = spec.name
        wire.append(ToolSpec(name=safe, description=spec.description, parameters=spec.parameters))
    return wire, aliases


def _reverse_aliases(aliases: dict[str, str]) -> dict[str, str]:
    return {original: wire for wire, original in aliases.items()}


def _text_parts(content: Any) -> list[str]:
    """Normalize a langchain message chunk's content into text fragments."""
    if isinstance(content, str):
        return [content] if content else []
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                parts.append(str(item["text"]))
        return parts
    return []


class FakeModel:
    """Deterministic model returning a schema-valid JSON fence for the agent.

    When tools are provided it requests the first tool exactly once (before any
    tool results are present), making the model-driven tool loop testable.
    """

    def __init__(self, agent: str) -> None:
        self.agent = agent

    def _final(self) -> ModelResult:
        payload = _FAKE_PAYLOADS.get(self.agent, {})
        body = f"# {self.agent} draft\n\nGenerated by the deterministic fake model.\n"
        fence = f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```"
        return ModelResult(text=f"{body}\n{fence}", token_in=10, token_out=20)

    async def generate(self, system: str, user: str, tools: list[ToolSpec] | None = None) -> ModelResult:
        del system
        if tools and TOOL_RESULT_MARKER not in user:
            tool = tools[0]
            return ModelResult(
                text=f"Calling {tool.name}.",
                token_in=10,
                token_out=5,
                tool_calls=[ToolCall(name=tool.name, arguments={"query": user.strip()[:200]}, id="fake-tool-call-1")],
            )
        return self._final()

    async def generate_messages(
        self, messages: list[ModelMessage], tools: list[ToolSpec] | None = None
    ) -> ModelResult:
        user_content = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                user_content = str(message.get("content") or "")
                break
        if tools and not any(message.get("role") == "tool" for message in messages):
            tool = tools[0]
            return ModelResult(
                text=f"Calling {tool.name}.",
                token_in=10,
                token_out=5,
                tool_calls=[ToolCall(name=tool.name, arguments={"query": user_content[:200]}, id="fake-tool-call-1")],
            )
        return self._final()

    async def stream(self, system: str, user: str, on_delta: DeltaSink) -> StreamResult:
        result = await self.generate(system, user)
        for chunk in _chunk_text(result.text, 24):
            await on_delta(chunk)
        return StreamResult(text=result.text, token_in=result.token_in, token_out=result.token_out)


class DeepSeekModel:
    """DeepSeek chat model via langchain-openai (tool calling + streaming)."""

    def __init__(
        self,
        model: str,
        base_url: str,
        api_key: str,
        *,
        temperature: float = 0.3,
        timeout_seconds: float = 120.0,
        max_retries: int = 2,
    ) -> None:
        from langchain_openai import ChatOpenAI

        self._llm = ChatOpenAI(
            model=model,
            base_url=base_url,
            api_key=api_key,
            temperature=temperature,
            timeout=timeout_seconds,
            max_retries=max_retries,
            stream_usage=True,
        )

    def _extract(self, response: Any, aliases: dict[str, str] | None = None) -> ModelResult:
        content = response.content if isinstance(response.content, str) else json.dumps(response.content)
        usage = getattr(response, "usage_metadata", None) or {}
        mapping = aliases or {}
        calls = [
            ToolCall(
                name=mapping.get(str(call.get("name") or ""), str(call.get("name") or "")),
                arguments=dict(call.get("args") or {}),
                id=str(call.get("id") or ""),
            )
            for call in (getattr(response, "tool_calls", None) or [])
            if isinstance(call, dict) and call.get("name")
        ]
        return ModelResult(
            text=content,
            token_in=int(usage.get("input_tokens", 0) or 0),
            token_out=int(usage.get("output_tokens", 0) or 0),
            tool_calls=calls,
        )

    async def generate(self, system: str, user: str, tools: list[ToolSpec] | None = None) -> ModelResult:
        from langchain_core.messages import HumanMessage, SystemMessage

        messages: list[ModelMessage] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        if tools:
            return await self.generate_messages(messages, tools=tools)
        response = await self._llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
        return self._extract(response)

    async def generate_messages(
        self, messages: list[ModelMessage], tools: list[ToolSpec] | None = None
    ) -> ModelResult:
        from langchain_core.messages import (
            AIMessage,
            HumanMessage,
            SystemMessage,
            ToolMessage,
        )

        wire_tools, aliases = _wire_tools(tools) if tools else ([], {})
        to_wire = _reverse_aliases(aliases)
        chain_messages: list[Any] = []
        for message in messages:
            role = message.get("role")
            if role == "system":
                chain_messages.append(SystemMessage(content=message.get("content") or ""))
            elif role == "user":
                chain_messages.append(HumanMessage(content=message.get("content") or ""))
            elif role == "assistant":
                chain_messages.append(
                    AIMessage(
                        content=message.get("content") or "",
                        tool_calls=[
                            {
                                "name": to_wire.get(call.get("name") or "", call.get("name") or ""),
                                "args": call.get("arguments") or {},
                                "id": call.get("id") or "call_0",
                            }
                            for call in message.get("tool_calls") or []
                        ],
                    )
                )
            elif role == "tool":
                content = message.get("content") or ""
                name = message.get("name")
                chain_messages.append(
                    ToolMessage(
                        content=content,
                        name=to_wire.get(name, name) if name else None,
                        tool_call_id=message.get("tool_call_id") or "",
                    )
                )
        llm = self._llm.bind_tools([_openai_tool(tool) for tool in wire_tools]) if wire_tools else self._llm
        response = await llm.ainvoke(chain_messages)
        return self._extract(response, aliases)

    async def stream(self, system: str, user: str, on_delta: DeltaSink) -> StreamResult:
        from langchain_core.messages import HumanMessage, SystemMessage

        full = ""
        token_in = 0
        token_out = 0
        async for chunk in self._llm.astream([SystemMessage(content=system), HumanMessage(content=user)]):
            for piece in _text_parts(chunk.content):
                full += piece
                await on_delta(piece)
            usage = getattr(chunk, "usage_metadata", None) or {}
            token_in = int(usage.get("input_tokens", token_in) or token_in)
            token_out = int(usage.get("output_tokens", token_out) or token_out)
        return StreamResult(text=full, token_in=token_in, token_out=token_out)


def get_model(agent: str) -> AgentModel:
    """Return the fake model in tests/CI, else a DeepSeek model when configured."""
    settings = get_settings()
    fake = getattr(settings, "agent_model_fake", False)
    if fake or not settings.deepseek_api_key:
        return FakeModel(agent)
    model = settings.deepseek_model or "deepseek-chat"
    return DeepSeekModel(
        model=model,
        base_url=settings.deepseek_api_url,
        api_key=settings.deepseek_api_key,
        temperature=settings.model_temperature,
        timeout_seconds=settings.model_timeout_seconds,
        max_retries=settings.model_max_retries,
    )
