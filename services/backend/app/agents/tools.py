"""Allow-listed tools used by iScholar graphs.

Tools perform no privileged side effects. The harness, rather than the model,
decides whether a tool may be called and records every invocation.
"""

from __future__ import annotations

from typing import Any

import httpx


async def search_crossref(query: str, rows: int = 5) -> list[dict[str, Any]]:
    """Search Crossref and return a compact, citable result set."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(
            "https://api.crossref.org/works", params={"query": query, "rows": min(max(rows, 1), 10)}
        )
        response.raise_for_status()
    results: list[dict[str, Any]] = []
    for item in response.json().get("message", {}).get("items", []):
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


BUILTIN_TOOLS = {"scholar.search": search_crossref}
