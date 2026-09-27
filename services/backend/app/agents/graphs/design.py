"""design agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="design",
    artifact_kind="research_design",
    allowed_tools=[],
    context_kinds=["topic_proposal"],
)


def build(harness: AgentHarness):
    """Build the design graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
