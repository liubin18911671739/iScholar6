/**
 * WriteOutputPanel (components/agents/outputs/write-output.tsx)
 *
 * Functionality:
 * - Displays the latest "write" run: referenced citations and a line-level diff against the previous section content.
 * - Strips the embedded JSON block from the run text and diffs it with the matching manuscript block via `diff`.
 * - Falls back to a "new content" note with section and word count when no prior block exists.
 *
 * Notes:
 * - Reads runs, manuscripts, and blocks via local hooks; collaborates with `EmptyState` and `Badge`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { useLatestAgentRun, useLocalManuscripts, useLocalManuscriptBlocks } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type WriteOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, GitCompare } from "lucide-react";
import * as Diff from "diff";

/** Props for `WriteOutputPanel`: the owning project id. */
interface WriteOutputPanelProps {
  projectId: string;
}

/** Renders structured output and content diff from the Write agent run. */
export function WriteOutputPanel({ projectId }: WriteOutputPanelProps) {
  const t = useTranslations("output.write");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "write");
  const { data: manuscripts } = useLocalManuscripts(projectId);
  const { data: blocks } = useLocalManuscriptBlocks(manuscripts?.[0]?.id ?? "");

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  const structured = latestRun.outputs?.structured as AgentStructuredOutput | undefined;
  const writeData = structured as WriteOutput | undefined;
  const references = writeData?.references ?? [];

  // Get the current section from the run inputs
  const section = (latestRun.inputs?.section as string) ?? "introduction";

  // Find the previous manuscript block for this section to show diff
  const previousBlock = blocks?.find((b) => b.section === section);

  // Get the new content (strip JSON block)
  const newContent = (latestRun.outputs?.text as string ?? "")
    .replace(/```json[\s\S]*?```/g, "")
    .trim();

  // Compute diff
  const diffLines = previousBlock?.content
    ? Diff.diffLines(previousBlock.content, newContent)
    : null;

  return (
    <div className="space-y-4">
      {/* References */}
      {references.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">
              {t("references")} ({references.length})
            </h3>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-1.5">
              {references.map((ref, i) => (
                <div
                  key={i}
                  className="rounded-md border p-1.5 space-y-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                      {ref.key}
                    </Badge>
                    <p className="text-[10px] font-medium line-clamp-1">
                      {ref.title ?? t("unnamed")}
                    </p>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    {ref.authors ?? t("unknownAuthor")}
                    {ref.year ? ` (${ref.year})` : ""}
                    {ref.venue ? ` — ${ref.venue}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Diff Viewer */}
      {diffLines && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("changes")}</h3>
          </div>
          <ScrollArea className="max-h-[250px]">
            <div className="rounded-md border bg-background font-mono text-[10px]">
              {diffLines.map((part, i) => {
                const lines = part.value.split("\n").filter(Boolean);
                return lines.map((line, j) => (
                  <div
                    key={`${i}-${j}`}
                    className={`px-2 py-0.5 ${
                      part.added
                        ? "bg-green-500/10 text-green-600"
                        : part.removed
                          ? "bg-red-500/10 text-red-600 line-through"
                          : ""
                    }`}
                  >
                    {part.added ? "+ " : part.removed ? "- " : "  "}
                    {line}
                  </div>
                ));
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Section info */}
      {!previousBlock && newContent && (
        <div className="rounded-md border p-2">
          <p className="text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[9px] h-4 px-1">{section}</Badge> {t("newContent")}
            {writeData?.wordCount ? ` • ${writeData.wordCount} ${t("wordCount")}` : ""}
          </p>
        </div>
      )}

      {references.length === 0 && !diffLines && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}
