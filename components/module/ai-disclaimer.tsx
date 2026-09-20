/**
 * AI Disclaimer (components/module/ai-disclaimer.tsx)
 *
 * Functionality:
 * - Renders a dismissible-looking amber warning banner about AI-generated output.
 * - Selects an agent-specific disclaimer when the agent is built in, otherwise falls back to the topic disclaimer.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { isBuiltInAgent, type AgentId } from "@/lib/ai/agents/registry";

/** Displays the localized AI disclaimer for the given agent. */
export function AiDisclaimer({ agentId }: { agentId: AgentId }) {
  const t = useTranslations("module");

  // Use the agent-specific disclaimer only for registered built-in agents.
  const body = isBuiltInAgent(agentId)
    ? t(`disclaimer.${agentId}` as "disclaimer.topic")
    : t("disclaimer.topic");

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100/90">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <span>
        <span className="font-semibold text-amber-200">
          {t("disclaimerTitle")}：
        </span>
        {body}
      </span>
    </div>
  );
}
