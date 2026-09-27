"""Scholar search MCP tool (port of ``lib/mcp/tools/scholar-search.ts``)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.mcp.guards import guarded_get_json


class ToolParams(BaseModel):
    """Base params accepting/emitting camelCase JSON keys."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OpenAlexSearchParams(ToolParams):
    query: str = Field(description="Search query")
    per_page: int = Field(default=10, ge=1, le=50)
    year_from: int | None = None
    year_to: int | None = None


def _reconstruct_abstract(inverted: dict[str, list[int]] | None) -> str | None:
    if not inverted:
        return None
    words: list[str] = []
    for word, positions in inverted.items():
        for position in positions:
            if 0 <= position < 100_000:
                if position >= len(words):
                    words.extend([""] * (position - len(words) + 1))
                words[position] = word
    return " ".join(words)


async def openalex_search(params: OpenAlexSearchParams) -> list[dict[str, Any]]:
    """Search academic papers via the OpenAlex API."""
    filters: list[str] = []
    if params.year_from or params.year_to:
        start = params.year_from or 1900
        end = params.year_to or datetime.now(UTC).year
        filters.append(f"publication_year:{start}-{end}")

    query: dict[str, Any] = {"search": params.query, "per_page": str(params.per_page)}
    if filters:
        query["filter"] = ",".join(filters)

    data = await guarded_get_json("https://api.openalex.org/works", params=query)
    results = []
    for work in data.get("results", []):
        primary = work.get("primary_location") or {}
        results.append(
            {
                "id": work.get("id"),
                "doi": work.get("doi"),
                "title": work.get("title"),
                "authors": [
                    (authorship.get("author") or {}).get("name")
                    for authorship in work.get("authorships", [])
                ],
                "year": work.get("publication_year"),
                "venue": (primary.get("source") or {}).get("display_name") if primary.get("source") else None,
                "citationCount": work.get("cited_by_count"),
                "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
            }
        )
    return results
