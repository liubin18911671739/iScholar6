"""Citation lookup MCP tools (port of ``lib/mcp/tools/citation-parser.ts``)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import Field

from app.mcp.guards import guarded_get_json
from app.mcp.tools.scholar import ToolParams


class CrossrefLookupParams(ToolParams):
    doi: str = Field(description="DOI identifier (e.g., 10.1038/s41586-024-07386-0)")


class CrossrefSearchParams(ToolParams):
    query: str = Field(description="Search query")
    rows: int = Field(default=5, ge=1, le=10)


class SemanticScholarParams(ToolParams):
    query: str = Field(description="Search query")
    limit: int = Field(default=10, ge=1, le=100)
    year_from: int | None = None
    year_to: int | None = None


async def crossref_lookup(params: CrossrefLookupParams) -> dict[str, Any]:
    """Look up a publication by DOI via the Crossref API."""
    data = await guarded_get_json(f"https://api.crossref.org/works/{params.doi}")
    item = data.get("message", {})
    published = item.get("published") or {}
    date_parts = published.get("dateParts") or []
    return {
        "doi": item.get("DOI"),
        "title": (item.get("title") or [None])[0],
        "authors": [
            f"{author.get('given', '')} {author.get('family', '')}".strip()
            for author in item.get("author", [])
        ],
        "year": date_parts[0][0] if date_parts and date_parts[0] else None,
        "venue": (item.get("container-title") or [None])[0],
        "abstract": item.get("abstract"),
        "type": item.get("type"),
        "citationCount": item.get("is-referenced-by-count"),
    }


async def crossref_search(params: CrossrefSearchParams) -> list[dict[str, Any]]:
    """Search Crossref by query and return a compact, citable result set."""
    data = await guarded_get_json(
        "https://api.crossref.org/works", params={"query": params.query, "rows": params.rows}
    )
    results = []
    for item in data.get("message", {}).get("items", []):
        title = (item.get("title") or ["Untitled"])[0]
        doi = item.get("DOI")
        results.append(
            {
                "title": title,
                "doi": doi,
                "url": f"https://doi.org/{doi}" if doi else item.get("URL"),
                "published": item.get("published-print") or item.get("published-online"),
            }
        )
    return results


async def semantic_scholar(params: SemanticScholarParams) -> list[dict[str, Any]]:
    """Search papers via the Semantic Scholar graph API."""
    query: dict[str, Any] = {
        "query": params.query,
        "limit": str(params.limit),
        "fields": "title,authors,year,abstract,citationCount,venue,externalIds",
    }
    if params.year_from:
        query["year"] = f"{params.year_from}-{params.year_to or datetime.now(UTC).year}"

    data = await guarded_get_json("https://api.semanticscholar.org/graph/v1/paper/search", params=query)
    results = []
    for paper in data.get("data", []):
        results.append(
            {
                "id": paper.get("paperId"),
                "doi": (paper.get("externalIds") or {}).get("DOI"),
                "title": paper.get("title"),
                "authors": [author.get("name") for author in paper.get("authors", [])],
                "year": paper.get("year"),
                "venue": paper.get("venue"),
                "citationCount": paper.get("citationCount"),
                "abstract": paper.get("abstract"),
            }
        )
    return results
