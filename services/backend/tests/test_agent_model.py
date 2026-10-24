"""Model tool-calling + streaming and the model-driven draft loop (no network)."""

from __future__ import annotations

import asyncio
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
    # Registry names with dots are rewritten onto the provider wire alphabet.
    assert stub.bound[0]["function"]["name"] == "scholar_search"
    # Model-returned calls are mapped back to the registry name.
    assert [call.name for call in result.tool_calls] == ["scholar.search"]
    assert result.tool_calls[0].arguments == {"query": "q"}
    assert result.token_in == 3 and result.token_out == 4


def test_wire_tools_sanitize_aliases_and_keep_uniqueness() -> None:
    from app.agents.model import ToolSpec, _wire_tools

    specs = [ToolSpec(name=name, description="d") for name in ["scholar.search", "a.b", "a_b"]]
    wire, aliases = _wire_tools(specs)
    assert [spec.name for spec in wire] == ["scholar_search", "a_b", "a_b_1"]
    assert aliases == {"scholar_search": "scholar.search", "a_b": "a.b", "a_b_1": "a_b"}


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


# ---------------------------------------------------------------------------
# Stage 2: tool round-trip message protocol + structured-output repair


@pytest.mark.asyncio
async def test_run_agent_draft_wraps_tool_results_as_tool_messages() -> None:
    seen: list[list[dict[str, Any]]] = []

    class _MessageSpyModel(FakeModel):
        async def generate_messages(self, messages: list[dict[str, Any]], tools=None):
            seen.append([dict(m) for m in messages])
            return await super().generate_messages(messages, tools=tools)

    harness = _RecordingHarness()
    result, _tool_results = await run_agent_draft(
        harness, _MessageSpyModel("litreview"), "sys", "goal", ["scholar.search"]
    )

    # Round 1: system + user → tool call requested.
    assert [m["role"] for m in seen[0]] == ["system", "user"]
    # Round 2: assistant carries tool_calls, and the tool result is id-bound.
    assert [m["role"] for m in seen[1]] == ["system", "user", "assistant", "tool"]
    assert seen[1][2]["tool_calls"][0]["name"] == "scholar.search"
    assert seen[1][3]["tool_call_id"] == seen[1][2]["tool_calls"][0]["id"]
    assert result.text and parse_agent_output("litreview", result.text)


@pytest.mark.asyncio
async def test_structured_output_repair_retries_once_with_feedback() -> None:
    from app.agents.graphs._common import finalize_structured
    from app.agents.model import ModelResult

    class _RepairModel:
        def __init__(self) -> None:
            self.calls = 0
            self.repair_prompt: str | None = None

        async def generate(self, system: str, user: str, tools=None):
            return await self.generate_messages([])

        async def stream(self, system: str, user: str, on_delta):
            from app.agents.model import StreamResult

            return StreamResult()

        async def generate_messages(self, messages: list[dict[str, Any]], tools=None):
            self.calls += 1
            self.repair_prompt = str(messages[-1].get("content"))
            return ModelResult(text='```json\n{"papers": [], "themes": [], "gaps": []}\n```', token_in=2, token_out=2)

    harness = _RecordingHarness()
    model = _RepairModel()
    first = ModelResult(text="no fence at all", token_in=1, token_out=1)

    structured = await finalize_structured(harness, model, "litreview", "sys", first)

    # Parse failed → exactly one budgeted repair call with feedback.
    assert model.calls == 1
    assert model.repair_prompt is not None and "```json" in model.repair_prompt
    assert structured is not None
    assert any(event_type == "schema.repaired" for event_type, _ in harness.events)


def test_deepseek_generate_messages_returns_model_result() -> None:
    model = DeepSeekModel.__new__(DeepSeekModel)
    model._llm = _StubChat()  # type: ignore[attr-defined]

    result = asyncio.run(
        model.generate_messages(
            [
                {"role": "system", "content": "s"},
                {"role": "user", "content": "u"},
                {
                    "role": "assistant",
                    "content": "calling",
                    "tool_calls": [{"id": "t1", "name": "scholar.search", "arguments": {"query": "q"}}],
                },
                {"role": "tool", "tool_call_id": "t1", "name": "scholar.search", "content": "[{}]"},
            ]
        )
    )

    assert result.text == "final answer"
    assert [call.name for call in result.tool_calls] == ["scholar.search"]
