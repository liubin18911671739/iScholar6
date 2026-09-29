"""Agent prompts, schemas, model, and graph wiring (no network, no DB)."""

import pytest

from app.agents.graphs import CONFIGS, allowed_tools_for, build_graph_for
from app.agents.model import FakeModel, get_model
from app.agents.prompts import SYSTEM_PROMPTS, build_user_prompt
from app.agents.schemas import SCHEMAS, parse_agent_output

BUILTINS = ["topic", "litreview", "design", "data", "write", "submit", "rebuttal"]


def test_system_prompts_cover_all_agents() -> None:
    assert set(SYSTEM_PROMPTS) == set(BUILTINS)
    assert set(SCHEMAS) == set(BUILTINS)


def test_build_user_prompt_per_agent() -> None:
    assert "literature-focused" in build_user_prompt("topic", {"analysisMode": "literature", "discipline": "CS"})
    assert "trend analysis" in build_user_prompt("topic", {"analysisMode": "trends"})
    assert "literature review" in build_user_prompt("litreview", {"query": "graphene"})
    assert "Design a research study" in build_user_prompt("design", {"researchQuestion": "Q"})
    assert "data analysis" in build_user_prompt("data", {"dataSource": "csv"})
    assert "introduction" in build_user_prompt("write", {"section": "introduction"})
    assert "Match this paper" in build_user_prompt("submit", {"abstract": "x"})
    assert "reviewer comments" in build_user_prompt("rebuttal", {"reviewerComments": "c"})


def test_context_is_prefixed_into_user_prompt() -> None:
    prompt = build_user_prompt("design", {"researchQuestion": "Q"}, context="Context from previous topic analysis:\nfoo")
    assert prompt.startswith("Context from previous topic analysis:")


def test_parse_agent_output_valid_and_invalid() -> None:
    text = 'Analysis...\n```json\n{"topics": [{"title": "T", "gap": "G", "novelty": 8, "value": 7, "feasibility": 6, "rationale": "R"}]}\n```'
    parsed = parse_agent_output("topic", text)
    assert parsed is not None
    assert parsed["topics"][0]["title"] == "T"

    assert parse_agent_output("topic", "no fence here") is None
    assert parse_agent_output("topic", "```json\n{bad json}\n```") is None
    assert parse_agent_output("topic", '```json\n{"topics": []}\n```') is not None


@pytest.mark.asyncio
async def test_fake_model_output_parses_for_every_agent() -> None:
    for agent in BUILTINS:
        result = await FakeModel(agent).generate("system", "user")
        assert parse_agent_output(agent, result.text) is not None


def test_get_model_defaults_to_fake_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.agents import model as model_module
    from app.core.config import Settings

    # No key (or the fake flag) ⇒ deterministic FakeModel.
    monkeypatch.setattr(
        model_module, "get_settings", lambda: Settings(agent_model_fake=True, deepseek_api_key=None)
    )
    assert isinstance(get_model("topic"), FakeModel)

    # A configured key without the fake flag ⇒ DeepSeek model. Stub the class so
    # the test does not construct a real network client.
    class _StubDeepSeek:
        def __init__(self, **kwargs: object) -> None:
            self.kwargs = kwargs

    monkeypatch.setattr(model_module, "DeepSeekModel", _StubDeepSeek)
    monkeypatch.setattr(
        model_module, "get_settings", lambda: Settings(agent_model_fake=False, deepseek_api_key="sk-test")
    )
    assert isinstance(get_model("topic"), _StubDeepSeek)


def test_graph_registry_and_tool_allowlist() -> None:
    assert set(BUILTINS) <= set(CONFIGS)
    assert "hermes" in CONFIGS
    assert "orchestrator" in CONFIGS
    assert "scholar.search" in allowed_tools_for("litreview")
    assert allowed_tools_for("write") == set()
    # Unknown agents raise instead of silently running the default graph.
    try:
        build_graph_for("unknown", harness=None)  # type: ignore[arg-type]
    except ValueError:
        pass
    else:
        raise AssertionError("unknown agent must not build the default graph")
    assert allowed_tools_for("coach") == set()
    assert allowed_tools_for("p.demo.tool") == set()


def test_coach_and_plugin_graphs_are_built() -> None:
    # Coach and plugin agents resolve to generic builders (not the default graph).
    assert build_graph_for("coach", harness=None) is not None  # type: ignore[arg-type]
    assert build_graph_for("p.demo.polisher", harness=None) is not None  # type: ignore[arg-type]


def test_hermes_system_prompt() -> None:
    from app.agents.prompts import build_hermes_system_prompt

    prompt = build_hermes_system_prompt("litreview")
    assert "LitReview" in prompt
    assert "conversational assistant mode" in prompt
