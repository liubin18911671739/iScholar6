"""MCP tool registry (port of ``lib/mcp/gateway.ts`` semantics).

Holds built-in and (later) plugin tools by name, validates parameters with a
Pydantic model, and exposes harness/HTTP-callable handlers. Built-ins cannot be
shadowed by plugin tools.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

from app.mcp.tools.citations import (
    CrossrefLookupParams,
    CrossrefSearchParams,
    SemanticScholarParams,
    crossref_lookup,
    crossref_search,
    semantic_scholar,
)
from app.mcp.tools.ischolar import (
    ListProjectsParams,
    ManuscriptOutlineParams,
    SearchBibliographyParams,
    list_projects,
    manuscript_outline,
    search_bibliography,
)
from app.mcp.tools.journals import JournalFinderParams, journal_finder
from app.mcp.tools.scholar import OpenAlexSearchParams, openalex_search

Handler = Callable[[Any], Awaitable[Any]]


@dataclass(frozen=True)
class MCPTool:
    """A registered MCP tool: schema + async handler + origin."""

    name: str
    description: str
    params_model: type[BaseModel]
    handler: Handler
    source: str = "builtin"
    plugin_id: str | None = None


_BUILTIN_TOOLS: tuple[MCPTool, ...] = (
    MCPTool(
        "scholar.search",
        "Search Crossref for citable publications by query",
        CrossrefSearchParams,
        crossref_search,
    ),
    MCPTool(
        "openalex_search",
        "Search academic papers via OpenAlex API",
        OpenAlexSearchParams,
        openalex_search,
    ),
    MCPTool(
        "crossref_lookup",
        "Look up a publication by DOI via Crossref API",
        CrossrefLookupParams,
        crossref_lookup,
    ),
    MCPTool(
        "semantic_scholar",
        "Search papers via Semantic Scholar API",
        SemanticScholarParams,
        semantic_scholar,
    ),
    MCPTool(
        "journal_finder",
        "Find journals matching a paper's abstract and keywords",
        JournalFinderParams,
        journal_finder,
    ),
    MCPTool(
        "ischolar.list_projects",
        "List the caller's research projects",
        ListProjectsParams,
        list_projects,
    ),
    MCPTool(
        "ischolar.search_bibliography",
        "Search a project's bibliography by title/abstract",
        SearchBibliographyParams,
        search_bibliography,
    ),
    MCPTool(
        "ischolar.manuscript_outline",
        "Return a project's manuscripts with their section outline",
        ManuscriptOutlineParams,
        manuscript_outline,
    ),
)


@dataclass
class ToolRegistry:
    """In-memory registry of MCP tools."""

    _tools: dict[str, MCPTool] = field(default_factory=dict)

    def register(self, tool: MCPTool, *, allow_overwrite_builtin: bool = False) -> None:
        existing = self._tools.get(tool.name)
        if existing and existing.source == "builtin" and tool.source != "builtin" and not allow_overwrite_builtin:
            raise ValueError(f"Cannot overwrite built-in MCP tool: {tool.name}")
        self._tools[tool.name] = tool

    def unregister(self, name: str) -> None:
        existing = self._tools.get(name)
        if existing and existing.source == "builtin":
            return
        self._tools.pop(name, None)

    def get(self, name: str) -> MCPTool | None:
        return self._tools.get(name)

    def list(self) -> list[MCPTool]:
        return list(self._tools.values())

    def names(self) -> set[str]:
        return set(self._tools)

    async def call(self, name: str, params: dict[str, Any] | None = None) -> Any:
        tool = self.get(name)
        if tool is None:
            raise KeyError(f"Unknown tool: {name}")
        validated = tool.params_model.model_validate(params or {})
        return await tool.handler(validated)


registry = ToolRegistry()
for _tool in _BUILTIN_TOOLS:
    registry.register(_tool)
