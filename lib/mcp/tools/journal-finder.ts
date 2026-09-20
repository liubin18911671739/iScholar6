/**
 * Journal Finder MCP Tool (lib/mcp/tools/journal-finder.ts)
 *
 * Functionality:
 * - Registers the `journal_finder` tool that matches an abstract plus keywords to journals.
 * - Queries the OpenAlex sources API with type and open-access filters.
 * - Enriches each result with APC, h-index, homepage, and top subjects.
 *
 * Notes:
 * - Fetches live with a 20s timeout and self-registers on import.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { z } from "zod";
import { registerTool } from "../gateway";

// Registers the abstract/keyword journal matching tool backed by OpenAlex.
registerTool({
  name: "journal_finder",
  description: "Find journals matching a paper's abstract and keywords",
  parameters: z.object({
    abstract: z.string().describe("Paper abstract"),
    keywords: z.array(z.string()).describe("Paper keywords"),
    openAccess: z.boolean().default(false),
  }),
  execute: async (params) => {
    const { abstract, keywords, openAccess } = params as {
      abstract: string;
      keywords: string[];
      openAccess: boolean;
    };

    // Build search query from keywords + abstract excerpt
    const abstractExcerpt = abstract ? abstract.slice(0, 200).split(/\s+/).slice(0, 15).join(" ") : "";
    const keywordPart = keywords.slice(0, 3).join(" ");
    const query = [keywordPart, abstractExcerpt].filter(Boolean).join(" ");

    const url = new URL("https://api.openalex.org/sources");
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", "10");

    // Build filters
    const filters: string[] = [];
    filters.push("type:journal");
    if (openAccess) {
      filters.push("is_oa:true");
    }
    url.searchParams.set("filter", filters.join(","));

    // Request additional fields for enrichment
    url.searchParams.set(
      "select",
      "id,display_name,type,is_oa,works_count,cited_by_count,homepage_url,description,apc_usd,h_index,updated_date,subjects"
    );

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`OpenAlex sources API error: ${res.status}`);

    const data = await res.json();

    return (data.results || []).map((source: Record<string, unknown>) => ({
      id: source.id,
      name: source.display_name,
      type: source.type,
      isOpenAccess: source.is_oa,
      worksCount: source.works_count,
      citedByCount: source.cited_by_count,
      homepage: source.homepage_url,
      // Enriched fields
      description: source.description ?? null,
      apcUsd: source.apc_usd ?? null,
      hIndex: source.h_index ?? null,
      subjects: Array.isArray(source.subjects)
        ? (source.subjects as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map((s) => s.display_name ?? s.name)
            .filter(Boolean)
        : [],
    }));
  },
});
