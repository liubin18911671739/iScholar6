/**
 * Rebuttal Agent Page (/projects/[projectId]/rebuttal)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to REBUTTAL_CONFIG.
 * - Provides the reviewer-rebuttal agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { REBUTTAL_CONFIG } from "@/components/agents/agent-configs";

/** Rebuttal agent page; renders AgentPageTemplate with REBUTTAL_CONFIG. */
export default function RebuttalPage() {
  return <AgentPageTemplate config={REBUTTAL_CONFIG} />;
}
