/**
 * RebuttalOutputPanel (components/agents/outputs/rebuttal-output.tsx)
 *
 * Functionality:
 * - Displays the latest "rebuttal" run as expandable reviewer-comment/author-response pairs.
 * - Shows the reviewer comment, author response, change location, and supporting evidence for each item.
 * - Exports all responses as a downloadable HTML (.doc) point-by-point table.
 *
 * Notes:
 * - Reads runs via `useLatestAgentRun`; uses the Accordion and Badge primitives.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { useLatestAgentRun } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type RebuttalOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageSquare, Download } from "lucide-react";

/** Props for `RebuttalOutputPanel`: the owning project id. */
interface RebuttalOutputPanelProps {
  projectId: string;
}

/** Renders structured output from the Rebuttal agent run. */
export function RebuttalOutputPanel({ projectId }: RebuttalOutputPanelProps) {
  const t = useTranslations("output.rebuttal");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "rebuttal");

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  const structured = latestRun.outputs?.structured as AgentStructuredOutput | undefined;
  const rebuttalData = structured as RebuttalOutput | undefined;
  const responses = rebuttalData?.responses ?? [];

  // Serializes responses into a standalone HTML document and downloads it.
  function handleExport() {
    if (responses.length === 0) return;

    // Build a formatted HTML document for export
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Rebuttal — Point-by-Point Response</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px 12px; border: 1px solid #ddd; vertical-align: top; }
    th { background: #f5f5f5; font-size: 13px; }
    td { font-size: 13px; }
    .comment { font-style: italic; }
    .response { }
    .location { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Point-by-Point Response to Reviewer Comments</h1>
  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Reviewer Comment</th>
        <th>Author Response</th>
        <th>Change Location</th>
      </tr>
    </thead>
    <tbody>
      ${responses
        .map(
          (r) => `<tr>
        <td>${r.commentNumber}</td>
        <td class="comment">${r.comment}</td>
        <td class="response">${r.response}</td>
        <td class="location">${r.changeLocation ?? "—"}</td>
      </tr>`
        )
        .join("\n")}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rebuttal-response.doc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">
            {t("pointByPoint")} ({responses.length})
          </h3>
        </div>
        {responses.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleExport}>
            <Download className="h-3 w-3 mr-1" />
            {t("export")}
          </Button>
        )}
      </div>

      {/* Accordion for expandable responses */}
      {responses.length > 0 && (
        <ScrollArea className="max-h-[350px]">
          <Accordion type="multiple" className="w-full">
            {responses.map((resp) => (
              <AccordionItem key={resp.commentNumber} value={`comment-${resp.commentNumber}`}>
                <AccordionTrigger className="text-[11px] py-1.5 hover:no-underline">
                  <div className="flex items-center gap-2 text-left">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
                      #{resp.commentNumber}
                    </Badge>
                    <span className="line-clamp-1">{resp.comment}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pt-1">
                    <div>
                      <p className="text-[9px] font-medium text-muted-foreground">{t("reviewerComment")}</p>
                      <p className="text-[10px] italic bg-muted/30 rounded p-1.5 mt-0.5">
                        {resp.comment}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-medium text-muted-foreground">{t("authorResponse")}</p>
                      <p className="text-[10px] bg-primary/5 rounded p-1.5 mt-0.5">
                        {resp.response}
                      </p>
                    </div>
                    {resp.changeLocation && (
                      <div>
                        <p className="text-[9px] font-medium text-muted-foreground">{t("changeLocation")}</p>
                        <p className="text-[10px] mt-0.5">{resp.changeLocation}</p>
                      </div>
                    )}
                    {resp.evidence && (
                      <div>
                        <p className="text-[9px] font-medium text-muted-foreground">{t("supportingEvidence")}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {resp.evidence}
                        </p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>
      )}

      {responses.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}
