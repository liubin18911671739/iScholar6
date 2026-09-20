/**
 * SubmitOutputPanel (components/agents/outputs/submit-output.tsx)
 *
 * Functionality:
 * - Displays the latest "submit" run as a submission checklist and a journal-match table.
 * - Lets the user pick a target journal (fit score, impact factor, open-access flag, review timeline).
 * - Generates and downloads a ZIP submission package for the first manuscript via `downloadSubmissionPackage`.
 *
 * Notes:
 * - Reads runs/manuscripts through `useLatestAgentRun` and `useLocalManuscripts`; uses Table/Progress/ScrollArea.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLatestAgentRun, useLocalManuscripts } from "@/lib/local/hooks";
import { type AgentStructuredOutput, type SubmitOutput } from "@/lib/ai/parse-agent-output";
import { EmptyState } from "./shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send, CheckCircle2, Circle, Download, Loader2 } from "lucide-react";
import { downloadSubmissionPackage } from "@/lib/export/submission-package";

/** Props for `SubmitOutputPanel`: the owning project id. */
interface SubmitOutputPanelProps {
  projectId: string;
}

/** Renders structured output from the Submit agent run. */
export function SubmitOutputPanel({ projectId }: SubmitOutputPanelProps) {
  const t = useTranslations("output.submit");
  const tCommon = useTranslations("common");
  const latestRun = useLatestAgentRun(projectId, "submit");
  const { data: manuscripts } = useLocalManuscripts(projectId);
  const [packaging, setPackaging] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(0);

  // Bundles the manuscript and checklist into a downloadable submission package.
  async function handleDownloadPackage() {
    const manuscriptId = manuscripts?.[0]?.id;
    if (!manuscriptId) return;

    const structured = latestRun?.outputs?.structured as AgentStructuredOutput | undefined;
    const submitData = structured as SubmitOutput | undefined;
    const journalName = submitData?.journals?.[selectedJournal]?.name ?? "Target Journal";
    const checklist = submitData?.checklist;

    setPackaging(true);
    try {
      await downloadSubmissionPackage({
        projectId,
        manuscriptId,
        journalName,
        checklistItems: checklist,
      });
    } finally {
      setPackaging(false);
    }
  }

  if (!latestRun) {
    return (
      <EmptyState
        title={t("title")}
        description={t("hint")}
      />
    );
  }

  const structured = latestRun.outputs?.structured as AgentStructuredOutput | undefined;
  const submitData = structured as SubmitOutput | undefined;
  const journals = submitData?.journals ?? [];
  const checklist = submitData?.checklist ?? [];

  return (
    <div className="space-y-4">
      {/* Download Package Button */}
      {manuscripts?.[0]?.id && journals.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={handleDownloadPackage}
          disabled={packaging}
        >
          {packaging ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t("generating")}
            </>
          ) : (
            <>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("downloadZip")}
            </>
          )}
        </Button>
      )}

      {/* Submission Checklist */}
      {checklist.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("checklist")}</h3>
          </div>
          <div className="space-y-1">
            {checklist.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Journal Match Table */}
      {journals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t("journalMatch")}</h3>
          </div>
          <ScrollArea className="max-h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] h-7">#</TableHead>
                  <TableHead className="text-[10px] h-7">{t("journalMatch")}</TableHead>
                  <TableHead className="text-[10px] h-7 w-16">Fit</TableHead>
                  <TableHead className="text-[10px] h-7 w-10">IF</TableHead>
                  <TableHead className="text-[10px] h-7 w-10">OA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map((journal, i) => (
                  <TableRow
                    key={i}
                    className={`cursor-pointer ${i === selectedJournal ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedJournal(i)}
                  >
                    <TableCell className="text-[10px] py-1.5">{i + 1}</TableCell>
                    <TableCell className="text-[10px] py-1.5">
                      <p className="font-medium line-clamp-1">{journal.name}</p>
                      {journal.rationale && (
                        <p className="text-muted-foreground text-[9px] line-clamp-2 mt-0.5">
                          {journal.rationale}
                        </p>
                      )}
                      {journal.reviewTimeline && (
                        <p className="text-muted-foreground text-[9px] mt-0.5">
                          {t("reviewTimeline", { timeline: journal.reviewTimeline })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1">
                        <Progress value={journal.fitScore} className="h-1.5 w-10" />
                        <span className="text-[9px]">{journal.fitScore}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] py-1.5">
                      {journal.impactFactor ?? "—"}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {journal.openAccess != null && (
                        <Badge
                          variant={journal.openAccess ? "default" : "secondary"}
                          className="text-[9px] h-4 px-1"
                        >
                          {journal.openAccess ? t("oa") : t("nonOa")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {journals.length > 1 && (
            <p className="text-[9px] text-muted-foreground">
              {t("clickToSelect")}
            </p>
          )}
        </div>
      )}

      {journals.length === 0 && checklist.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tCommon("noData")}
        </p>
      )}
    </div>
  );
}
