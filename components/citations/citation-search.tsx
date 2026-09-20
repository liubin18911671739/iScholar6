/**
 * CitationSearch (components/citations/citation-search.tsx)
 *
 * Functionality:
 * - Tabbed scholarly search over Semantic Scholar, OpenAlex, and Crossref (by DOI) MCP tools.
 * - Calls `/api/mcp/[tool]` with a consent proof, records an audit entry, and lists normalized results.
 * - Adds individual results or all new results to the project bibliography using local hooks.
 *
 * Notes:
 * - Requires recorded AI consent via `getRecentAiConsent`; tracks already-added items with a key set.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createBibItem, bulkCreateBibItems, getRecentAiConsent } from "@/lib/local/hooks";
import { writeAuditEntry } from "@/lib/audit/ledger";
import { Search, Plus, PlusCircle, Loader2, BookOpen } from "lucide-react";

/** Normalized shape of a single search result shown in the UI. */
interface SearchResult {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  citationCount?: number;
}

/** Props for `CitationSearch`: the owning project id. */
interface CitationSearchProps {
  projectId: string;
}

// Invokes an MCP search tool with consent proof and returns normalized results.
async function searchMCP(toolName: string, projectId: string, params: Record<string, unknown>): Promise<SearchResult[]> {
  const consent = await getRecentAiConsent(projectId);
  if (!consent) throw new Error("请先确认脱敏并允许发送到外部 AI 服务");
  const res = await fetch(`/api/mcp/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, projectId, consentProof: { consentId: consent.id, consentedAt: consent.consentedAt, externalServices: consent.externalServices, redactionConfirmed: consent.redactionConfirmed } }),
  });

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }

  const data = await res.json();
  await writeAuditEntry({ projectId, actor: "local", action: `mcp.${toolName}`, consentId: consent.id });
  return data.results ?? data.papers ?? data ?? [];
}

/** Tabbed multi-provider literature search panel. */
export function CitationSearch({ projectId }: CitationSearchProps) {
  const t = useTranslations("citations");
  const [query, setQuery] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [doi, setDoi] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedSet, setAddedSet] = useState<Set<string>>(new Set());

  // Runs a DOI lookup or keyword search depending on the active tab.
  async function handleSearch(tool: string) {
    if (tool === "crossref_lookup") {
      if (!doi.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const data = await searchMCP("crossref_lookup", projectId, { doi: doi.trim() });
        setResults(Array.isArray(data) ? data : [data]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    } else {
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, unknown> = {
          query: query.trim(),
          limit: 20,
        };
        if (yearFrom) params.yearFrom = parseInt(yearFrom);
        if (yearTo) params.yearTo = parseInt(yearTo);
        const data = await searchMCP(tool, projectId, params);
        setResults(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }
  }

  // Persists one result and marks it as added.
  async function handleAdd(result: SearchResult) {
    const key = result.doi ?? result.title;
    await createBibItem({
      projectId,
      title: result.title,
      authors: result.authors,
      year: result.year,
      venue: result.venue,
      abstract: result.abstract,
      doi: result.doi,
      citationCount: result.citationCount,
    });
    setAddedSet((prev) => new Set(prev).add(key));
  }

  // Bulk-persists all not-yet-added results.
  async function handleAddAll() {
    const items = results
      .filter((r) => !addedSet.has(r.doi ?? r.title))
      .map((r) => ({
        projectId,
        title: r.title,
        authors: r.authors,
        year: r.year,
        venue: r.venue,
        abstract: r.abstract,
        doi: r.doi,
        citationCount: r.citationCount,
      }));
    if (items.length > 0) {
      await bulkCreateBibItems(items);
      setAddedSet(
        new Set(results.map((r) => r.doi ?? r.title))
      );
    }
  }

  return (
    <div className="space-y-3">
      <Tabs defaultValue="semantic_scholar">
        <TabsList className="w-full">
          <TabsTrigger value="semantic_scholar" className="flex-1 text-xs">
            {t("searchTitle")}
          </TabsTrigger>
          <TabsTrigger value="openalex_search" className="flex-1 text-xs">
            OpenAlex
          </TabsTrigger>
          <TabsTrigger value="crossref_lookup" className="flex-1 text-xs">
            DOI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="semantic_scholar" className="space-y-2">
          <div className="space-y-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSearch("semantic_scholar")}
            />
            <div className="flex gap-1.5">
              <Input
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                placeholder={t("startYear")}
                className="h-7 text-xs w-20"
              />
              <Input
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                placeholder={t("endYear")}
                className="h-7 text-xs w-20"
              />
              <Button
                size="sm"
                className="h-7"
                onClick={() => handleSearch("semantic_scholar")}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="openalex_search" className="space-y-2">
          <div className="flex gap-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchOpenAlex")}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSearch("openalex_search")}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleSearch("openalex_search")}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="crossref_lookup" className="space-y-2">
          <div className="flex gap-1.5">
            <Input
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="10.xxxx/xxxxx"
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSearch("crossref_lookup")}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleSearch("crossref_lookup")}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            {t("resultCount", { count: results.length })}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={handleAddAll}
          >
            <PlusCircle className="h-3 w-3 mr-1" />
            {t("added")}
          </Button>
        </div>
      )}

      <ScrollArea className="max-h-[250px]">
        <div className="space-y-1.5">
          {results.map((result, idx) => {
            const key = result.doi ?? result.title;
            const added = addedSet.has(key);
            return (
              <div
                key={idx}
                className="rounded-md border p-2 space-y-1"
              >
                <p className="text-xs font-medium leading-tight line-clamp-2">
                  {result.title}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {result.year && <span>{result.year}</span>}
                  {result.venue && (
                    <>
                      <span>·</span>
                      <span className="truncate">{result.venue}</span>
                    </>
                  )}
                  {result.citationCount != null && (
                    <Badge variant="secondary" className="h-3.5 text-[9px] px-1">
                      {result.citationCount} cit.
                    </Badge>
                  )}
                </div>
                {result.authors && result.authors.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {result.authors.slice(0, 3).join(", ")}
                    {result.authors.length > 3 && " et al."}
                  </p>
                )}
                <Button
                  variant={added ? "secondary" : "outline"}
                  size="sm"
                  className="h-6 w-full text-xs"
                  onClick={() => handleAdd(result)}
                  disabled={added}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {added ? t("added") : t("addToLibrary")}
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {results.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center py-6 text-muted-foreground">
          <BookOpen className="h-6 w-6 mb-1.5 opacity-50" />
          <p className="text-xs">{t("searchHint")}</p>
        </div>
      )}
    </div>
  );
}
