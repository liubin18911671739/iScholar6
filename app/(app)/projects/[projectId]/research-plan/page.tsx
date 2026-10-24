/**
 * Research Plan Workflow Page (/projects/[projectId]/research-plan)
 *
 * Functionality:
 * - Multi-agent collaboration page: topic → literature → design → quality →
 *   summary, with two operator gates, backed by the durable backend workflow.
 *
 * @author mrpi
 * @date 2026-10-23
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { RESEARCH_PLAN_CONFIG } from "@/components/agents/agent-configs";

/** Research-plan workflow page; renders AgentPageTemplate with RESEARCH_PLAN_CONFIG. */
export default function ResearchPlanPage() {
  return <AgentPageTemplate config={RESEARCH_PLAN_CONFIG} />;
}
