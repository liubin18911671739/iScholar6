"""Model tool-calling + streaming and the model-driven draft loop (no network)."""

from __future__ import annotations

from typing import Any

import pytest

from app.agents.graphs._common import build_tool_specs, run_agent_draft
from app.agents.harness import AgentHarness
from app.agents.model import TOOL_RESULT_MARKER, DeepSeekModel, FakeModel, ModelResult
from app.agents.schemas import parse_agent_output
from app.mcp.plugin_tools import PluginToolDef


class _RecordingHarness(AgentHarness):
    """Harness stub: records events instead of writing RunEvent rows."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.evidence: list[dict[str, Any]] = []

    async def emit(self, event_type: str, data: dict[str, Any]) -> None:
        self.events.append((event_type, data))

    async def call_tool(self, name: str, **arguments: Any) -> Any:
        self.calls.append((name, arguments))
        return [{"title": "Paper", "url": "https://example.org/p", "doi": "10.1/p"}]

    async def persist_evidence(self, evidence: list[dict[str, Any]]) -> None:
        self.evidence.extend(evidence)


def test_build_tool_specs_resolves_registry_tools() -> None:
    specs = build_tool_specs(["scholar.search", "does.not.exist"])
    assert [spec.name for spec in specs] == ["scholar.search"]
    assert specs[0].description
    assert specs[0].parameters.get("type") == "object"


@pytest.mark.asyncio
async def test_fake_model_requests_tool_once() -> None:
    model = FakeModel("litreview")
    specs = build_tool_specs(["scholar.search"])

    first = await model.generate("sys", "find papers", tools=specs)
    assert [call.name for call in first.tool_calls] == ["scholar.search"]
    assert first.tool_calls[0].arguments["query"] == "find papers"

    second = await model.generate("sys", f"find papers\n\n{TOOL_RESULT_MARKER}", tools=specs)
    assert second.tool_calls == []
    assert parse_agent_output("litreview", second.text) is not None


@pytest.mark.asyncio
async def test_fake_model_stream_aggregates() -> None:
    chunks: list[str] = []

    async def sink(piece: str) -> None:
        chunks.append(piece)

    result = await FakeModel("topic").stream("sys", "user", sink)
    assert "".join(chunks) == result.text
    assert len(chunks) > 1
    assert result.token_out == 20


@pytest.mark.asyncio
async def test_run_agent_draft_executes_tools_and_persists_evidence() -> None:
    harness = _RecordingHarness()
    result, tool_results = await run_agent_draft(
        harness, FakeModel("litreview"), "sys", "goal", ["scholar.search"]
    )

    assert harness.calls[0][0] == "scholar.search"
    assert tool_results and tool_results[0]["title"] == "Paper"
    assert harness.evidence and harness.evidence[0]["url"] == "https://example.org/p"
    assert parse_agent_output("litreview", result.text) is not None
    assert harness.events and all(event_type == "message.delta" for event_type, _ in harness.events)


class _PluginHarness(_RecordingHarness):
    """Harness stub exposing one owner-scoped declarative tool."""

    def __init__(self) -> None:
        super().__init__()
        self.plugin_tools = {
            "demo.lookup": PluginToolDef(
                name="demo.lookup",
                description="Look up a record",
                parameters={"type": "object", "properties": {"query": {"type": "string"}}},
                method="GET",
                url="https://api.example.com/{query}",
                plugin_id="demo",
            )
        }


@pytest.mark.asyncio
async def test_run_agent_draft_offers_owner_plugin_tools() -> None:
    harness = _PluginHarness()
    result, tool_results = await run_agent_draft(
        harness, FakeModel("litreview"), "sys", "goal", ["demo.lookup"]
    )

    assert harness.calls[0][0] == "demo.lookup"
    assert tool_results and tool_results[0]["title"] == "Paper"
    assert parse_agent_output("litreview", result.text) is not None


def test_build_tool_specs_includes_plugin_tools() -> None:
    spec = PluginToolDef(
        name="demo.lookup",
        description="Look up a record",
        parameters={"type": "object", "properties": {"query": {"type": "string"}}},
        method="GET",
        url="https://api.example.com/{query}",
        plugin_id="demo",
    )
    specs = build_tool_specs(["demo.lookup"], {"demo.lookup": spec})
    assert [item.name for item in specs] == ["demo.lookup"]
    assert specs[0].parameters == spec.parameters


@pytest.mark.asyncio
async def test_run_agent_draft_without_tools_streams_directly() -> None:
    harness = _RecordingHarness()
    result, tool_results = await run_agent_draft(harness, FakeModel("topic"), "sys", "goal", [])

    assert tool_results == []
    assert harness.calls == []
    assert result.text
    assert harness.events and all(event_type == "message.delta" for event_type, _ in harness.events)
    assert "".join(data["text"] for _, data in harness.events) == result.text


@pytest.mark.asyncio
async def test_emit_text_deltas_batches() -> None:
    harness = _RecordingHarness()
    await harness.emit_text_deltas("x" * 250, chunk_size=100)

    assert all(event_type == "message.delta" for event_type, _ in harness.events)
    assert [len(data["text"]) for _, data in harness.events] == [100, 100, 50]


class _StubResponse:
    content = "final answer"
    tool_calls = [{"name": "scholar.search", "args": {"query": "q"}, "id": "c1"}]
    usage_metadata = {"input_tokens": 3, "output_tokens": 4}


class _StubChat:
    def __init__(self) -> None:
        self.bound: Any = None

    def bind_tools(self, tools: Any) -> _StubChat:
        self.bound = tools
        return self

    async def ainvoke(self, messages: Any) -> _StubResponse:
        return _StubResponse()


@pytest.mark.asyncio
async def test_deepseek_generate_binds_tools_and_parses_calls() -> None:
    model = DeepSeekModel.__new__(DeepSeekModel)
    stub = _StubChat()
    model._llm = stub  # type: ignore[attr-defined]

    result: ModelResult = await model.generate("sys", "usr", tools=build_tool_specs(["scholar.search"]))

    assert stub.bound and stub.bound[0]["type"] == "function"
    assert stub.bound[0]["function"]["name"] == "scholar.search"
    assert [call.name for call in result.tool_calls] == ["scholar.search"]
    assert result.tool_calls[0].arguments == {"query": "q"}
    assert result.token_in == 3 and result.token_out == 4


class _StubChunk:
    def __init__(self, content: Any, usage: dict[str, int] | None = None) -> None:
        self.content = content
        self.usage_metadata = usage or {}


class _StubStreamChat:
    def __init__(self, chunks: list[_StubChunk]) -> None:
        self._chunks = chunks

    async def astream(self, messages: Any):
        for chunk in self._chunks:
            yield chunk


@pytest.mark.asyncio
async def test_deepseek_stream_emits_deltas_and_usage() -> None:
    model = DeepSeekModel.__new__(DeepSeekModel)
    model._llm = _StubStreamChat(  # type: ignore[attr-defined]
        [
            _StubChunk("Hel"),
            _StubChunk("lo [", usage={"input_tokens": 5, "output_tokens": 2}),
            _StubChunk([{"type": "text", "text": "world]"}]),
        ]
    )
    chunks: list[str] = []

    async def sink(piece: str) -> None:
        chunks.append(piece)

    result = await model.stream("sys", "usr", sink)
    assert "".join(chunks) == "Hello [world]"
    assert result.text == "Hello [world]"
    assert result.token_in == 5 and result.token_out == 2
