"""Training (coach) conversational graph.

Prompted by the client (learner task context); produces a free-form draft
artifact that is reviewed before it is applied.
"""

from __future__ import annotations

from app.agents.graphs._common import build_generic_graph
from app.agents.harness import AgentHarness

COACH_SYSTEM_PROMPT = (
    "You are the iScholar AI research coach. Guide the learner through the "
    "current training task with concise, actionable, discipline-aware advice. "
    "Respond in the language the learner uses."
)


def build(harness: AgentHarness):
    """Build the coach graph bound to the given harness."""
    return build_generic_graph("coach", "coach_draft", COACH_SYSTEM_PROMPT, harness)
