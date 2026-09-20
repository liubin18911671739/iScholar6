/**
 * Data Inputs (components/agents/configs/data/DataInputs.tsx)
 *
 * Functionality:
 * - Renders the data-source textarea and collection-method input for the data agent.
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

/** Input form for the data-analysis agent. */
export function DataInputs({ fieldState, setField }: InputProps) {
  const t = useTranslations("agentConfig");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("dataSource")}</Label>
        <p className="text-xs text-muted-foreground leading-relaxed">{t("dataSourceHelp")}</p>
        <Textarea
          value={fieldState.dataSource ?? ""}
          onChange={(e) => setField("dataSource", e.target.value)}
          placeholder={t("dataSourcePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("collectionMethod")}</Label>
        <p className="text-xs text-muted-foreground">{t("collectionMethodHelp")}</p>
        <Input
          value={fieldState.collectionMethod ?? ""}
          onChange={(e) => setField("collectionMethod", e.target.value)}
          placeholder={t("collectionMethodPlaceholder")}
        />
      </div>
    </div>
  );
}
