"""data agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="data",
    artifact_kind="analysis_plan",
    allowed_tools=[],
    context_kinds=["topic_proposal"],
)


def build(harness: AgentHarness):
    """Build the data graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
