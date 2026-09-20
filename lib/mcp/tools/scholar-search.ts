/**
 * Scholar Search (lib/mcp/tools/scholar-search.ts)
 *
 * Functionality:
 * - Registers the `openalex_search` MCP tool with the shared gateway at import time.
 * - Queries the OpenAlex `/works` endpoint with query text, pagination, and optional year filters.
 * - Normalizes each work into a compact shape and rebuilds abstracts from the inverted index.
 *
 * Notes:
 * - Calls the public OpenAlex REST API via `fetch` with a 20s abort timeout.
 * - Depends on `@/lib/mcp/gateway` for tool registration.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { registerTool } from "../gateway";

// Register the OpenAlex literature search tool when this module is imported.
registerTool({
  name: "openalex_search",
  description: "Search academic papers via OpenAlex API",
  parameters: z.object({
    query: z.string().describe("Search query"),
    perPage: z.number().min(1).max(50).default(10),
    yearFrom: z.number().optional(),
    yearTo: z.number().optional(),
  }),
  execute: async (params) => {
    const { query, perPage, yearFrom, yearTo } = params as {
      query: string;
      perPage: number;
      yearFrom?: number;
      yearTo?: number;
    };

    // Build OpenAlex `filter` clauses for an optional publication-year range.
    const filters: string[] = [];
    if (yearFrom || yearTo) {
      const from = yearFrom || 1900;
      const to = yearTo || new Date().getFullYear();
      filters.push(`publication_year:${from}-${to}`);
    }

    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", String(perPage));
    if (filters.length > 0) {
      url.searchParams.set("filter", filters.join(","));
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`OpenAlex API error: ${res.status}`);

    const data = await res.json();

    return (data.results || []).map((work: Record<string, unknown>) => ({
      id: work.id,
      doi: work.doi,
      title: work.title,
      authors: (work.authorships as Array<Record<string, unknown>>)?.map(
        (a) => (a.author as Record<string, unknown>)?.name
      ),
      year: work.publication_year,
      venue: (work.primary_location as Record<string, unknown>)?.source,
      citationCount: work.cited_by_count,
      abstract: reconstructAbstract(work.abstract_inverted_index as Record<string, number[]>),
    }));
  },
});

// Rebuild plain abstract text from OpenAlex's inverted index of word positions.
function reconstructAbstract(
  inverted?: Record<string, number[]>
): string | undefined {
  if (!inverted) return undefined;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.join(" ");
}
