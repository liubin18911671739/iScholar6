"""litreview agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="litreview",
    artifact_kind="literature_brief",
    allowed_tools=["scholar.search"],
    context_kinds=["topic_proposal"],
)


def build(harness: AgentHarness):
    """Build the litreview graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
