/**
 * LitReview Module Content (components/agents/configs/litreview/LitReviewModuleContent.tsx)
 *
 * Functionality:
 * - Custom module layout for the literature-review agent: a database tag selector plus inputs panel.
 * - Shows a failure notice and renders the workspace and outputs stacked in the right column.
 * - Holds local UI-only state for the selected literature databases.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";

/** Two-column module layout for the literature-review agent with database selector. */
export function LitReviewModuleContent(props: ModuleContentProps) {
  const { inputs, workspace, outputs, status, errorMessage } = props;
  const t = useTranslations("moduleInputs.litreview");
  // Local-only list of selected databases; currently decorative.
  const [databases, setDatabases] = useState<string[]>(["PubMed", "WoS"]);
  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[300px_1fr]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold">{t("searchLiterature")}</h3>
            <div className="space-y-2">
              <Label className="text-xs">{t("databasesLabel")} </Label>
              <TagInput
                options={["PubMed", "CNKI", "WoS", "Scopus"]}
                selected={databases}
                onChange={setDatabases}
              />
            </div>
            {inputs}
          </div>
        </ScrollColumn>

        <ScrollColumn>
          <div className="space-y-4">
            {status === "failed" && (
              <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
                <p className="font-medium">文献综述运行失败</p>
                <p className="mt-1 break-words text-xs">{errorMessage || "未返回错误详情"}</p>
              </div>
            )}
            {workspace}
            {outputs}
          </div>
        </ScrollColumn>
      </div>
    </div>
  );
}
