"""Per-agent graph registry."""

from __future__ import annotations

from app.agents.graphs import data, design, hermes, litreview, rebuttal, submit, topic, write
from app.agents.graphs._common import AgentGraphConfig
from app.agents.harness import AgentHarness

_BUILDERS = {
    "topic": topic.build,
    "litreview": litreview.build,
    "design": design.build,
    "data": data.build,
    "write": write.build,
    "submit": submit.build,
    "rebuttal": rebuttal.build,
    "hermes": hermes.build,
}

CONFIGS: dict[str, AgentGraphConfig] = {
    "topic": topic.CONFIG,
    "litreview": litreview.CONFIG,
    "design": design.CONFIG,
    "data": data.CONFIG,
    "write": write.CONFIG,
    "submit": submit.CONFIG,
    "rebuttal": rebuttal.CONFIG,
    "hermes": hermes.CONFIG,
}

DEFAULT_AGENT = "topic"


def build_graph_for(agent: str, harness: AgentHarness):
    """Build the graph for an agent (unknown agents fall back to the generic topic graph)."""
    builder = _BUILDERS.get(agent, _BUILDERS[DEFAULT_AGENT])
    return builder(harness)


def allowed_tools_for(agent: str) -> set[str]:
    """Tool allow-list for an agent."""
    config = CONFIGS.get(agent) or CONFIGS[DEFAULT_AGENT]
    return set(config.allowed_tools)
