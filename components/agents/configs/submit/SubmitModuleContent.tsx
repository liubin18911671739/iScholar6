/**
 * Submit Module Content (components/agents/configs/submit/SubmitModuleContent.tsx)
 *
 * Functionality:
 * - Custom three-column module layout for the submit agent: cover-letter inputs, a journal-fit table, and a checklist.
 * - Tracks a local submission checklist and renders per-journal fit scores with circular progress.
 * - Shows a static journal recommendation table plus the submit user manual.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CircularProgress } from "@/components/ui/circular-progress";
import { UserManual } from "@/components/module/user-manual";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { Send } from "lucide-react";

/** Three-column module layout for the journal-submission agent. */
export function SubmitModuleContent({ inputs, outputs }: ModuleContentProps) {
  const t = useTranslations("moduleInputs.submit");
  // Local checklist state for submission readiness.
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    manuscript: false, coverLetter: false, figures: false, supplements: false, titlePage: false,
  });

  const toggleCheck = (key: string) => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  const checkedCount = Object.values(checklist).filter(Boolean).length;
  const totalItems = Object.keys(checklist).length;

  // Static sample journal recommendations shown in the fit table.
  const journals = [
    { name: "Computers & Education", quartile: "Q1", impactFactor: 12.8, reviewCycle: "6-8周", fitScore: 92 },
    { name: "British Journal of Educational Technology", quartile: "Q1", impactFactor: 8.5, reviewCycle: "4-6周", fitScore: 85 },
    { name: "Learning and Instruction", quartile: "Q1", impactFactor: 7.2, reviewCycle: "8-10周", fitScore: 78 },
    { name: "Educational Technology Research & Development", quartile: "Q2", impactFactor: 5.4, reviewCycle: "6-8周", fitScore: 65 },
  ];

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[300px_1fr_260px]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" />
              {t("generateCoverLetter")}
            </h3>
            {inputs}
          </div>
        </ScrollColumn>

        <ScrollColumn>
          <div className="cosmic-panel rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] h-8">{t("journalName")}</TableHead>
                  <TableHead className="text-[10px] h-8 w-12">{t("quartile")}</TableHead>
                  <TableHead className="text-[10px] h-8 w-14">{t("impactFactor")}</TableHead>
                  <TableHead className="text-[10px] h-8 w-16">{t("reviewCycle")}</TableHead>
                  <TableHead className="text-[10px] h-8 w-16 text-center">{t("fitScore")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map((j, i) => (
                  <TableRow key={i} className="cursor-pointer hover:bg-muted/30">
                    <TableCell className="text-[11px] py-2 font-medium">{j.name}</TableCell>
                    <TableCell className="text-[10px] py-2">
                      <Badge variant="outline" className="text-[9px] bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-400/30">{j.quartile}</Badge>
                    </TableCell>
                    <TableCell className="text-[10px] py-2 font-mono">{j.impactFactor}</TableCell>
                    <TableCell className="text-[10px] py-2 text-muted-foreground">{j.reviewCycle}</TableCell>
                    <TableCell className="py-2 flex justify-center">
                      <CircularProgress value={j.fitScore} size={40} strokeWidth={3}
                        gradient={j.fitScore >= 80 ? { from: "#22c55e", to: "#10b981" } : j.fitScore >= 50 ? { from: "#eab308", to: "#f59e0b" } : { from: "#6b7280", to: "#9ca3af" }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2">{outputs}</div>
        </ScrollColumn>

        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("checklist")}</h3>
              <Badge variant="outline" className="text-[10px]">{checkedCount}/{totalItems}</Badge>
            </div>
            <Progress value={(checkedCount / totalItems) * 100} className="h-1.5" />
            <div className="space-y-2">
              {[
                { key: "manuscript", label: t("checklistManuscript") },
                { key: "coverLetter", label: t("checklistCoverLetter") },
                { key: "figures", label: t("checklistFigures") },
                { key: "supplements", label: t("checklistSupplements") },
                { key: "titlePage", label: t("checklistTitlePage") },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded-md px-2 py-1.5 transition-colors">
                  <Checkbox checked={checklist[item.key] ?? false} onCheckedChange={() => toggleCheck(item.key)} className="h-4 w-4" />
                  <span className={`text-xs ${checklist[item.key] ? "text-foreground line-through decoration-muted-foreground/40" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <UserManual agentId="submit" />
        </ScrollColumn>
      </div>
    </div>
  );
}
