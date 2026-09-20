/**
 * Data Module Content (components/agents/configs/data/DataModuleContent.tsx)
 *
 * Functionality:
 * - Custom two-column module layout for the data agent: an inputs panel beside the results workspace.
 * - Wraps each column in ScrollColumn for independent scrolling.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { BarChart3 } from "lucide-react";

/** Two-column module layout for the data-analysis agent. */
export function DataModuleContent({ inputs, workspace }: ModuleContentProps) {
  const t = useTranslations("moduleInputs.data");

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[300px_1fr]">
        <ScrollColumn>
          <div className="cosmic-panel rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-teal-400" />
              {t("runAnalysis")}
            </h3>
            {inputs}
          </div>
        </ScrollColumn>

        <ScrollColumn>
          {workspace}
        </ScrollColumn>
      </div>
    </div>
  );
}
