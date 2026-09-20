/**
 * Submit Inputs (components/agents/configs/submit/SubmitInputs.tsx)
 *
 * Functionality:
 * - Renders abstract, keywords, and open-access inputs for the journal-submission agent.
 * - Reads and writes field values through the shared InputProps fieldState/setField contract.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InputProps } from "../../agent-page-template";

/** Input form for the journal-submission agent. */
export function SubmitInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("agentConfig");
  const tCommon = useTranslations("common");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("abstract")}</Label>
        <Textarea
          value={fieldState.abstract ?? ""}
          onChange={(e) => setField("abstract", e.target.value)}
          placeholder={t("abstractPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("keywords")}</Label>
        <Input
          value={fieldState.keywords ?? ""}
          onChange={(e) => setField("keywords", e.target.value)}
          placeholder={t("keywordsPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("openAccess")}</Label>
        <select
          value={fieldState.openAccess ?? "yes"}
          onChange={(e) => setField("openAccess", e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="yes">{tCommon("yes")}</option>
          <option value="no">{tCommon("no")}</option>
        </select>
      </div>
    </div>
  );
}
