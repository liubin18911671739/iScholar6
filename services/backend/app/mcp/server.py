"""iScholar MCP server exposing the built-in tools.

Run standalone (stdio) with ``python -m app.mcp.server`` or serve streamable
HTTP via ``mcp.run(transport="streamable-http")``. Tools delegate to the shared
registry so the REST API and the MCP transport expose the same surface.
"""

from __future__ import annotations

import asyncio
from typing import Any

from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from app.core.config import get_settings
from app.mcp.registry import registry

INSTRUCTIONS = (
    "iScholar research tools: literature search (OpenAlex/Crossref/Semantic Scholar) "
    "and journal matching. External calls require a recorded redaction consent. "
    "Identity-scoped domain tools (ischolar.*) are served only by the authenticated "
    "REST API, not this shared-token server."
)


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Require ``Authorization: Bearer <MCP_SERVER_TOKEN>`` when a token is configured."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        super().__init__(app)
        self.token = token

    async def dispatch(self, request: Any, call_next: Any) -> Any:
        if request.headers.get("authorization") != f"Bearer {self.token}":
            return JSONResponse({"error": "UNAUTHORIZED"}, status_code=401)
        return await call_next(request)


def build_mcp_server() -> FastMCP:
    """Build the iScholar MCP server with the built-in tools registered."""
    server = FastMCP("ischolar", instructions=INSTRUCTIONS, stateless_http=True)

    async def scholar_search(query: str, rows: int = 5) -> list[dict[str, Any]]:
        """Search Crossref for citable publications by query."""
        return await registry.call("scholar.search", {"query": query, "rows": rows})

    async def openalex_search(
        query: str, per_page: int = 10, year_from: int | None = None, year_to: int | None = None
    ) -> list[dict[str, Any]]:
        """Search academic papers via the OpenAlex API."""
        return await registry.call(
            "openalex_search",
            {"query": query, "perPage": per_page, "yearFrom": year_from, "yearTo": year_to},
        )

    async def crossref_lookup(doi: str) -> dict[str, Any]:
        """Look up a publication by DOI via the Crossref API."""
        return await registry.call("crossref_lookup", {"doi": doi})

    async def semantic_scholar(
        query: str, limit: int = 10, year_from: int | None = None, year_to: int | None = None
    ) -> list[dict[str, Any]]:
        """Search papers via the Semantic Scholar API."""
        return await registry.call(
            "semantic_scholar",
            {"query": query, "limit": limit, "yearFrom": year_from, "yearTo": year_to},
        )

    async def journal_finder(
        abstract: str, keywords: list[str] | None = None, open_access: bool = False
    ) -> list[dict[str, Any]]:
        """Find journals matching a paper's abstract and keywords."""
        return await registry.call(
            "journal_finder",
            {"abstract": abstract, "keywords": keywords or [], "openAccess": open_access},
        )

    server.add_tool(scholar_search, name="scholar.search")
    server.add_tool(openalex_search, name="openalex_search")
    server.add_tool(crossref_lookup, name="crossref_lookup")
    server.add_tool(semantic_scholar, name="semantic_scholar")
    server.add_tool(journal_finder, name="journal_finder")
    return server


def build_mcp_http_app() -> Any:
    """Build the standalone streamable-HTTP MCP app, enforcing the server token if set."""
    app = build_mcp_server().streamable_http_app()
    token = get_settings().mcp_server_token
    if token:
        app.add_middleware(BearerAuthMiddleware, token=token)
    return app


def main() -> None:
    """Run the MCP server over stdio (default transport)."""
    asyncio.run(build_mcp_server().run_stdio_async())


if __name__ == "__main__":
    main()
