"""write agent graph."""

from __future__ import annotations

from app.agents.graphs._common import AgentGraphConfig, build_agent_graph
from app.agents.harness import AgentHarness

CONFIG = AgentGraphConfig(
    agent="write",
    artifact_kind="manuscript_draft",
    allowed_tools=[],
    context_kinds=[],
)


def build(harness: AgentHarness):
    """Build the write graph bound to the given harness."""
    return build_agent_graph(CONFIG, harness)
