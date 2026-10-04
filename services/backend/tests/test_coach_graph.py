"""Checkpointed multi-turn coach graph (no network, no database)."""

from __future__ import annotations

import pytest
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.graphs import training
from app.agents.model import ModelResult, StreamResult


class _RecordingModel:
    """Streams a deterministic reply and records the serialized conversation."""

    def __init__(self) -> None:
        self.users: list[str] = []

    async def generate(self, system: str, user: str, tools: object = None) -> ModelResult:  # pragma: no cover
        raise AssertionError("the coach graph must stream, not generate")

    async def stream(self, system: str, user: str, on_delta) -> StreamResult:
        self.users.append(user)
        text = f"reply-{len(self.users)}"
        await on_delta(text)
        return StreamResult(text=text, token_in=1, token_out=1)


class _StubHarness:
    """Harness stub exposing only what the coach graph uses."""

    def __init__(self) -> None:
        self.deltas: list[str] = []

    async def stream_model(self, model, system: str, user: str, **kwargs: object) -> ModelResult:
        chunks: list[str] = []

        async def sink(piece: str) -> None:
            chunks.append(piece)

        result = await model.stream(system, user, sink)
        self.deltas.append("".join(chunks))
        return ModelResult(text=result.text, token_in=result.token_in, token_out=result.token_out)


def _compile(model: _RecordingModel, harness: _StubHarness):
    return training.build(harness, model=model).compile(checkpointer=InMemorySaver())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_coach_accumulates_messages_across_turns() -> None:
    harness = _StubHarness()
    model = _RecordingModel()
    graph = _compile(model, harness)
    config = {"configurable": {"thread_id": "coach-thread"}}

    first = await graph.ainvoke({"goal": "Q1", "project_id": "p", "agent": "coach", "input": {}}, config=config)
    assert first["draft"]["text"] == "reply-1"

    second = await graph.ainvoke({"goal": "Q2", "project_id": "p", "agent": "coach", "input": {}}, config=config)
    assert second["draft"]["text"] == "reply-2"

    # The second turn sees the first turn's human + assistant messages.
    assert "user: Q1" in model.users[1]
    assert "assistant: reply-1" in model.users[1]
    assert "user: Q2" in model.users[1]


@pytest.mark.asyncio
async def test_coach_accepts_client_supplied_messages() -> None:
    harness = _StubHarness()
    model = _RecordingModel()
    graph = _compile(model, harness)
    config = {"configurable": {"thread_id": "coach-messages"}}

    await graph.ainvoke(
        {"goal": "", "project_id": "p", "agent": "coach", "input": {"messages": [{"role": "user", "content": "Hello coach"}]}},
        config=config,
    )

    assert "user: Hello coach" in model.users[0]
