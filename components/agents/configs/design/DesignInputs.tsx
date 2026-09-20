/**
 * Design Inputs (components/agents/configs/design/DesignInputs.tsx)
 *
 * Functionality:
 * - Renders the research-question textarea and methodology input for the design agent.
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

/** Input form for the study-design agent. */
export function DesignInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("agentConfig");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("researchQuestion")}</Label>
        <Textarea
          value={fieldState.researchQuestion ?? ""}
          onChange={(e) => setField("researchQuestion", e.target.value)}
          placeholder={t("researchQuestionPlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("methodHint")}</Label>
        <Input
          value={fieldState.methodology ?? ""}
          onChange={(e) => setField("methodology", e.target.value)}
          placeholder={t("methodHintPlaceholder")}
        />
      </div>
    </div>
  );
}
