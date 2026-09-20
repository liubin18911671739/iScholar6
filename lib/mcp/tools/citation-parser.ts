/**
 * Citation Lookup MCP Tools (lib/mcp/tools/citation-parser.ts)
 *
 * Functionality:
 * - Registers the `crossref_lookup` tool to resolve a DOI via the Crossref works API.
 * - Registers the `semantic_scholar` tool to search papers via the Semantic Scholar graph API.
 * - Normalizes author names, years, venues, and citation counts into shared result shapes.
 *
 * Notes:
 * - Both tools perform live network fetches with a 20s timeout and self-register on import.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { registerTool } from "../gateway";

// Registers a DOI-to-metadata tool backed by the Crossref works API.
registerTool({
  name: "crossref_lookup",
  description: "Look up a publication by DOI via Crossref API",
  parameters: z.object({
    doi: z.string().describe("DOI identifier (e.g., 10.1038/s41586-024-07386-0)"),
  }),
  execute: async (params) => {
    const { doi } = params as { doi: string };

    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Crossref API error: ${res.status}`);

    const data = await res.json();
    const item = data.message;

    return {
      doi: item.DOI,
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      authors: (item.author || []).map(
        (a: { given?: string; family?: string }) =>
          `${a.given || ""} ${a.family || ""}`.trim()
      ),
      year: item.published?.dateParts?.[0]?.[0],
      venue: item["container-title"]?.[0],
      abstract: item.abstract,
      type: item.type,
      citationCount: item["is-referenced-by-count"],
    };
  },
});

// Registers a paper search tool backed by the Semantic Scholar graph API.
registerTool({
  name: "semantic_scholar",
  description: "Search papers via Semantic Scholar API",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().min(1).max(100).default(10),
    yearFrom: z.number().optional(),
    yearTo: z.number().optional(),
  }),
  execute: async (params) => {
    const { query, limit, yearFrom, yearTo } = params as {
      query: string;
      limit: number;
      yearFrom?: number;
      yearTo?: number;
    };

    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("fields", "title,authors,year,abstract,citationCount,venue,externalIds");

    if (yearFrom) url.searchParams.set("year", `${yearFrom}-${yearTo || new Date().getFullYear()}`);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`);

    const data = await res.json();

    return (data.data || []).map((p: Record<string, unknown>) => ({
      id: p.paperId,
      doi: (p.externalIds as Record<string, unknown>)?.DOI,
      title: p.title,
      authors: (p.authors as Array<Record<string, unknown>>)?.map((a) => a.name),
      year: p.year,
      venue: p.venue,
      citationCount: p.citationCount,
      abstract: p.abstract,
    }));
  },
});
