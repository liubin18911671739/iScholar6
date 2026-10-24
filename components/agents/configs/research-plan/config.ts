/**
 * ResearchPlan Config (components/agents/configs/research-plan/config.ts)
 *
 * Functionality:
 * - Declares the multi-agent research-plan workflow page: inputs, streamed
 *   results + gate console, and the final-plan output panel.
 * - Sends the workflow goal + language directive (backend prompts are
 *   workflow-controlled; client prompt packs are ignored by design).
 *
 * @author mrpi
 * @date 2026-10-23
 */

import type { AgentPageConfig } from "../../agent-page-template";
import { ResearchPlanOutputPanel } from "@/components/agents/outputs/research-plan-output";
import { useLocaleStore } from "@/lib/stores/locale-store";
import { ResearchPlanInputs } from "./ResearchPlanInputs";
import { ResearchPlanResults } from "./ResearchPlanResults";

/** Configuration for the research-plan multi-agent workflow page. */
export const RESEARCH_PLAN_CONFIG: AgentPageConfig = {
  agentId: "research-plan",
  InputsComponent: ResearchPlanInputs,
  ResultsComponent: ResearchPlanResults,
  OutputComponent: ResearchPlanOutputPanel,
  buildRunInput: (fs) => ({
    researchGoal: fs.researchGoal,
    discipline: fs.discipline,
    keywords: (fs.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
    query: fs.researchGoal,
    language: useLocaleStore.getState().agentLanguage,
  }),
  manuscriptSection: "researchPlan",
  manuscriptOrder: 0,
};
