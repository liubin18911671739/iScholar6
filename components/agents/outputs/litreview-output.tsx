/**
 * LitReviewOutputPanel (components/agents/outputs/litreview-output.tsx)
 *
 * Functionality:
 * - Presents the latest "litreview" run as an evidence table plus year, topic, author, and gap visualizations.
 * - Computes theme coverage, publication-year distribution, and shared co-authors from the parsed papers.
 * - Can bulk-add all papers to the local bibliography via `bulkCreateBibItems` and export individual BibTeX entries.
 *
 * Notes:
 * - Uses recharts and shadcn Table/ScrollArea; input types come from `lib/ai/parse-agent-output`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLatestAgentRun, bulkCreateBibItems } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type LitReviewOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen, PlusCircle, Network, Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// Builds a minimal BibTeX entry from a paper's metadata.
function generateBibTeX(paper: {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
}): string {
  const key = paper.authors?.[0]?.split(" ").pop()?.toLowerCase() ?? "unknown";
  const year = paper.year ?? new Date().getFullYear();
  const entryKey = `${key}${year}`;
  const authorList = paper.authors?.join(" and ") ?? "Unknown";
  const venue = paper.venue ?? "Unknown venue";
  const doi = paper.doi ? `\n  doi = {${paper.doi}},` : "";
  return `@article{${entryKey},\n  author = {${authorList}},\n  title = {${paper.title}},\n  journal = {${venue}},\n  year = {${year}},${doi}\n}`;
}

// Triggers a client-side download of the paper's generated BibTeX file.
function handleDownloadBibTeX(paper: {
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
}) {
  const bibtex = generateBibTeX(paper);
  const blob = new Blob([bibtex], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${paper.title?.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_") ?? "paper"}.bib`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Palette cycled across themes and chart cells.
const THEME_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/** Props for `LitReviewOutputPanel`: the owning project id. */
interface LitReviewOutputPanelProps {
  projectId: string;
}

/** Renders structured output from the Literature Review agent run. */
export function LitReviewOutputPanel({ projectId }: LitReviewOutputPanelProps) {
  const t = useTranslations("output.litreview");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "litreview");

  // Extract data before early return so hooks stay unconditional
  const structured = latestRun?.outputs?.structured as AgentStructuredOutput | undefined;
  const litData = structured as LitReviewOutput | undefined;
  const papers = useMemo(() => litData?.papers ?? [], [litData?.papers]);
  const themes = useMemo(() => litData?.themes ?? [], [litData?.themes]);
  const gaps = litData?.gaps ?? [];

  // Memoized to prevent recharts infinite re-render
  // Counts papers whose title/findings/method mention each identified theme.
  const themeData = useMemo(
    () =>
      themes.map((theme) => {
        const count = papers.filter((p) => {
          const text = `${p.title} ${p.findings ?? ""} ${p.method ?? ""}`.toLowerCase();
          return text.includes(theme.toLowerCase().split(" ")[0]);
        }).length;
        return { name: theme.length > 15 ? theme.slice(0, 15) + "…" : theme, count, full: theme };
      }),
    [themes, papers]
  );

  // Buckets papers by publication year, sorted chronologically.
  const yearData = useMemo(() => {
    const yearMap = new Map<number, number>();
    papers.forEach((p) => {
      if (p.year) yearMap.set(p.year, (yearMap.get(p.year) ?? 0) + 1);
    });
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, count]) => ({ year: String(year), count }));
  }, [papers]);

  // Finds authors that appear on more than one parsed paper.
  const sharedAuthors = useMemo(() => {
    const authorPapers = new Map<string, number[]>();
    papers.forEach((p, idx) => {
      p.authors?.forEach((author) => {
        const key = author.toLowerCase().trim();
        if (!authorPapers.has(key)) authorPapers.set(key, []);
        authorPapers.get(key)!.push(idx);
      });
    });
    return Array.from(authorPapers.entries())
      .filter(([, indices]) => indices.length > 1)
      .slice(0, 10);
  }, [papers]);

  // Persists every parsed paper into the project bibliography.
  async function handleAddAll() {
    if (papers.length === 0) return;
    await bulkCreateBibItems(
      papers.map((p) => ({
        projectId,
        title: p.title,
        authors: p.authors,
        year: p.year,
        venue: p.venue,
        abstract: p.findings,
        doi: p.doi,
        metadata: { method: p.method },
      }))
    );
  }

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{t("evidenceTable")}</h3>
        </div>
        {papers.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleAddAll}>
            <PlusCircle className="h-3 w-3 mr-1" />
            {tCommon("addAll")}
          </Button>
        )}
      </div>

      {/* Year Distribution Chart */}
      {yearData.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{t("yearDistribution")}</p>
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearData} margin={{ top: 2, right: 2, left: -15, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "4px",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Theme Distribution */}
      {themeData.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{t("topicCoverage")}</p>
          <div className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={themeData} layout="vertical" margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "4px",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="count" radius={[0, 2, 2, 0]}>
                  {themeData.map((_, i) => (
                    <Cell key={i} fill={THEME_COLORS[i % THEME_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Themes as badges */}
      {themes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">{t("identifiedTopics")}</p>
          <div className="flex flex-wrap gap-1">
            {themes.map((theme, i) => (
              <Badge
                key={theme}
                variant="secondary"
                className="text-[10px]"
                style={{ borderColor: THEME_COLORS[i % THEME_COLORS.length], borderWidth: 1 }}
              >
                {theme}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Table */}
      {papers.length > 0 && (
        <ScrollArea className="max-h-[200px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] h-7">{t("papers")}</TableHead>
                <TableHead className="text-[10px] h-7 w-10">{t("year")}</TableHead>
                <TableHead className="text-[10px] h-7 w-16">{t("method")}</TableHead>
                <TableHead className="text-[10px] h-7">{t("findings")}</TableHead>
                <TableHead className="text-[10px] h-7 w-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.map((paper, i) => (
                <TableRow key={i}>
                  <TableCell className="text-[10px] py-1.5">
                    <p className="font-medium line-clamp-2">{paper.title}</p>
                    {paper.authors && (
                      <p className="text-muted-foreground truncate">
                        {paper.authors.slice(0, 2).join(", ")}
                        {paper.authors.length > 2 && " et al."}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] py-1.5">{paper.year ?? "—"}</TableCell>
                  <TableCell className="text-[10px] py-1.5">
                    <Badge variant="outline" className="text-[9px] h-4">
                      {paper.method ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] py-1.5 line-clamp-2">
                    {paper.findings ?? "—"}
                  </TableCell>
                  <TableCell className="text-[10px] py-1.5">
                    {paper.title && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title={t("downloadBibtex")}
                        onClick={() => handleDownloadBibTeX(paper)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      {/* Co-authorship Network (simplified as table) */}
      {sharedAuthors.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-primary" />
            <p className="text-[10px] text-muted-foreground">{t("coauthors")}</p>
          </div>
          <div className="space-y-0.5">
            {sharedAuthors.map(([author, indices]) => (
              <div key={author} className="flex items-center gap-1.5 text-[9px]">
                <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                  {t("paperCount", { count: indices.length })}
                </Badge>
                <span className="truncate">{author}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">{t("researchGaps")}</p>
          <ul className="text-[10px] space-y-0.5 text-muted-foreground">
            {gaps.map((gap, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-primary mt-0.5">•</span>
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {papers.length === 0 && themes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}
