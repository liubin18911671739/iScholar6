/**
 * Rebuttal Module Content (components/agents/configs/rebuttal/RebuttalModuleContent.tsx)
 *
 * Functionality:
 * - Custom module layout for the rebuttal agent: an inputs panel beside a reviewer-response table and checklist.
 * - Renders a static example response table styled by comment type, plus a response checklist.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InteractiveBadge } from "@/components/ui/interactive-badge";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { MessageSquare } from "lucide-react";

/** Two-column module layout for the reviewer-rebuttal agent. */
export function RebuttalModuleContent({ inputs, outputs }: ModuleContentProps) {
  const t = useTranslations("moduleInputs.rebuttal");

  // Static sample rows illustrating the reviewer-response table.
  const responses = [
    { reviewerId: "R1", commentType: "修改" as const, paragraph: "方法 2.3节", status: "修改" as const },
    { reviewerId: "R1", commentType: "建议" as const, paragraph: "引言 1.2节", status: "建议" as const },
    { reviewerId: "R2", commentType: "澄清" as const, paragraph: "结果 3.1节", status: "澄清" as const },
    { reviewerId: "R2", commentType: "修改" as const, paragraph: "讨论 4.2节", status: "修改" as const },
  ];

  // Maps a comment type/status to its badge color.
  const typeVariant = (t: string) => {
    switch (t) {
      case "修改": return "red" as const;
      case "建议": return "yellow" as const;
      default: return "blue" as const;
    }
  };

  // Static submission checklist items.
  const checklistItems = [
    "修订后的稿件正文（含修改高亮）",
    "逐条回复信",
    "修改对照表",
    "补充数据与图表",
  ];

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[340px_1fr]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-rose-400" />
              {t("parseComments")}
            </h3>
            {inputs}
          </div>
        </ScrollColumn>

        <ScrollColumn>
          <div className="space-y-4">
            <div className="cosmic-panel rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8 w-16">{t("reviewerId")}</TableHead>
                    <TableHead className="text-[10px] h-8 w-16">{t("commentType")}</TableHead>
                    <TableHead className="text-[10px] h-8">{t("relatedParagraph")}</TableHead>
                    <TableHead className="text-[10px] h-8 w-16">{t("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.map((r, i) => (
                    <TableRow key={i} className="hover:bg-muted/20">
                      <TableCell className="text-[11px] py-2 font-mono">{r.reviewerId}</TableCell>
                      <TableCell className="py-2">
                        <InteractiveBadge label={r.commentType} variant={typeVariant(r.commentType)} />
                      </TableCell>
                      <TableCell className="text-[11px] py-2">{r.paragraph}</TableCell>
                      <TableCell className="py-2">
                        <InteractiveBadge label={r.status} variant={typeVariant(r.status)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="cosmic-panel rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold">{t("checklistTitle")}</h3>
              <ul className="space-y-1">
                {checklistItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-rose-400 mt-0.5">☐</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {outputs}
          </div>
        </ScrollColumn>
      </div>
    </div>
  );
}
