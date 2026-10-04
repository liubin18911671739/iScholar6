"""Generic graph for plugin-defined agents (``p.<plugin>.<key>``).

Prompts are resolved client-side from the plugin's prompt pack; the graph
produces a free-form draft artifact. Declarative plugin MCP tools come from the
owner-scoped harness (`harness.plugin_tools`), never the global registry.
"""

from __future__ import annotations

from app.agents.graphs._common import build_generic_graph
from app.agents.harness import AgentHarness

PLUGIN_SYSTEM_PROMPT = (
    "You are a plugin-defined research assistant. Follow the user's instructions "
    "precisely, stay within the research domain, and respond in the language the "
    "user uses."
)


def build(harness: AgentHarness):
    """Build a generic plugin agent graph bound to the given harness."""
    plugin_tools = getattr(harness, "plugin_tools", None) or {}
    return build_generic_graph(
        "plugin", "plugin_draft", PLUGIN_SYSTEM_PROMPT, harness, allowed_tools=list(plugin_tools)
    )
