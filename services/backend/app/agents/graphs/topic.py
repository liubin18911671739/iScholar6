"""topic agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="topic",
    artifact_kind="topic_proposal",
    allowed_tools=["scholar.search"],
    context_kinds=[],
)


def build(harness: AgentHarness):
    """Build the topic graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
