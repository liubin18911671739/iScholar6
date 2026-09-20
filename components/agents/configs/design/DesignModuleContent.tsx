/**
 * Design Module Content (components/agents/configs/design/DesignModuleContent.tsx)
 *
 * Functionality:
 * - Custom module layout for the design agent: a PICO grid, study-type control, and generate button beside the workspace.
 * - Holds local UI-only state for the PICO fields and selected study type.
 * - Renders the real inputs hidden so privacy/render side effects still occur.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ScrollColumn } from "../shared/ScrollColumn";
import type { ModuleContentProps } from "../../agent-page-template";
import { Sparkles } from "lucide-react";

/** Two-column module layout for the study-design agent with PICO and study-type UI. */
export function DesignModuleContent({ inputs, workspace }: ModuleContentProps) {
  const t = useTranslations("moduleInputs.design");
  // Local-only UI state for the study type; not sent as agent input.
  const [studyType, setStudyType] = useState("RCT");
  // Local-only PICO fields used by this decorative design panel.
  const [pico, setPico] = useState({ p: "", i: "", c: "", o: "" });

  return (
    <div className="h-full p-4 sm:px-6">
      <div className="grid h-full gap-4 lg:grid-cols-[380px_1fr]">
        <ScrollColumn>
          <div className="grid grid-cols-2 gap-3">
            {(["p", "i", "c", "o"] as const).map((key) => {
              // i18n label and placeholder maps keyed by PICO element.
              const labels: Record<string, string> = { p: t("picoP"), i: t("picoI"), c: t("picoC"), o: t("picoO") };
              const placeholders: Record<string, string> = { p: t("picoPPlaceholder"), i: t("picoIPlaceholder"), c: t("picoCPlaceholder"), o: t("picoOPlaceholder") };
              return (
                <div key={key} className="cosmic-panel rounded-xl p-3 space-y-2 border-l-2 border-l-violet-400">
                  <Label className="text-xs font-bold text-violet-300">{labels[key]}</Label>
                  <Input value={pico[key]} onChange={(e) => setPico((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={placeholders[key]} className="text-xs h-8" />
                </div>
              );
            })}
          </div>

          <Button className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500">
            <Sparkles className="h-4 w-4" />
            {t("generateQuestion")}
          </Button>

          <div className="cosmic-panel rounded-xl p-4 space-y-3">
            <Label className="text-xs font-semibold">研究类型</Label>
            <SegmentedControl
              options={[
                { value: "RCT", label: t("studyTypeRCT") },
                { value: "cohort", label: t("studyTypeCohort") },
                { value: "crossSectional", label: t("studyTypeCrossSectional") },
              ]}
              value={studyType}
              onChange={setStudyType}
            />
          </div>

          <div className="hidden">{inputs}</div>
        </ScrollColumn>

        <ScrollColumn>
          {workspace}
        </ScrollColumn>
      </div>
    </div>
  );
}
