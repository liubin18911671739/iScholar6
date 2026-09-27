"""rebuttal agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="rebuttal",
    artifact_kind="rebuttal_draft",
    allowed_tools=[],
    context_kinds=[],
)


def build(harness: AgentHarness):
    """Build the rebuttal graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
