/**
 * WriteInputs (components/agents/configs/write/WriteInputs.tsx)
 *
 * Functionality:
 * - Renders the Write agent configuration form: target IMRaD section and citation style.
 * - Reads current values from the shared `fieldState` and writes changes through the `setField` callback.
 * - Falls back to "introduction" and "APA" defaults when no field value is set yet.
 *
 * Notes:
 * - Implements `InputProps` from the shared agent page template; labels come from next-intl.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InputProps } from "../../agent-page-template";

/** Write agent config inputs for target section and citation style. */
export function WriteInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("agentConfig");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("sections")}</Label>
        <select
          value={fieldState.section ?? "introduction"}
          onChange={(e) => setField("section", e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="introduction">{t("sectionNames.introduction")}</option>
          <option value="methods">{t("sectionNames.method")}</option>
          <option value="results">{t("sectionNames.results")}</option>
          <option value="discussion">{t("sectionNames.discussion")}</option>
          <option value="conclusion">{t("sectionNames.conclusion")}</option>
          <option value="abstract">{t("sectionNames.abstract")}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>{t("citationFormat")}</Label>
        <Input
          value={fieldState.citationStyle ?? "APA"}
          onChange={(e) => setField("citationStyle", e.target.value)}
          placeholder="APA"
        />
      </div>
    </div>
  );
}
