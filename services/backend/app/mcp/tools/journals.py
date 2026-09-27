"""Journal finder MCP tool (port of ``lib/mcp/tools/journal-finder.ts``)."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from app.mcp.guards import guarded_get_json
from app.mcp.tools.scholar import ToolParams


class JournalFinderParams(ToolParams):
    abstract: str = Field(description="Paper abstract")
    keywords: list[str] = Field(default_factory=list, description="Paper keywords")
    open_access: bool = False


async def journal_finder(params: JournalFinderParams) -> list[dict[str, Any]]:
    """Find journals matching a paper's abstract and keywords via OpenAlex sources."""
    abstract_excerpt = " ".join(params.abstract.split()[:15]) if params.abstract else ""
    keyword_part = " ".join(params.keywords[:3])
    query_text = " ".join(part for part in (keyword_part, abstract_excerpt) if part)

    filters = ["type:journal"]
    if params.open_access:
        filters.append("is_oa:true")

    data = await guarded_get_json(
        "https://api.openalex.org/sources",
        params={
            "search": query_text,
            "per_page": "10",
            "filter": ",".join(filters),
            "select": "id,display_name,type,is_oa,works_count,cited_by_count,homepage_url,description,apc_usd,h_index,updated_date,subjects",
        },
    )
    results = []
    for source in data.get("results", []):
        subjects = source.get("subjects") or []
        results.append(
            {
                "id": source.get("id"),
                "name": source.get("display_name"),
                "type": source.get("type"),
                "isOpenAccess": source.get("is_oa"),
                "worksCount": source.get("works_count"),
                "citedByCount": source.get("cited_by_count"),
                "homepage": source.get("homepage_url"),
                "description": source.get("description"),
                "apcUsd": source.get("apc_usd"),
                "hIndex": source.get("h_index"),
                "subjects": [
                    subject.get("display_name") or subject.get("name")
                    for subject in subjects[:5]
                    if subject.get("display_name") or subject.get("name")
                ],
            }
        )
    return results
