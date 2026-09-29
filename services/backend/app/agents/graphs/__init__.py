"""Per-agent graph registry."""

from __future__ import annotations

from app.agents.graphs import data, design, hermes, litreview, rebuttal, submit, topic, write
from app.agents.graphs._common import AgentGraphConfig
from app.agents.harness import AgentHarness

# Accepted run agents: built-ins, coach (training), or plugin agent ids `p.<plugin>.<key>`.
AGENT_ID_PATTERN = (
    r"^(orchestrator|topic|litreview|design|data|write|submit|rebuttal|hermes|coach)$"
    r"|^p\.[a-z0-9][a-z0-9_\-]*\.[A-Za-z0-9][A-Za-z0-9_\-]*$"
)

_BUILDERS = {
    "orchestrator": topic.build,
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
    "orchestrator": topic.CONFIG,
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
    """Build the graph for an agent.

    Built-ins use their dedicated graph; ``coach`` and plugin agent ids
    (``p.<plugin>.<key>``) resolve to their generic builders. Unknown agents
    raise instead of silently running the wrong graph.
    """
    builder = _BUILDERS.get(agent)
    if builder is not None:
        return builder(harness)
    if agent == "coach":
        from app.agents.graphs import training

        return training.build(harness)
    if agent.startswith("p."):
        from app.agents.graphs import plugin

        return plugin.build(harness)
    raise ValueError(f"UNKNOWN_AGENT: {agent}")


def allowed_tools_for(agent: str) -> set[str]:
    """Tool allow-list for an agent (plugin/coach tools are resolved per-run)."""
    config = CONFIGS.get(agent)
    if config is not None:
        return set(config.allowed_tools)
    if agent == "coach" or agent.startswith("p."):
        return set()
    raise ValueError(f"UNKNOWN_AGENT: {agent}")
