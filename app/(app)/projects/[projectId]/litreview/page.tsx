/**
 * Literature Review Agent Page (/projects/[projectId]/litreview)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to LITREVIEW_CONFIG.
 * - Provides the literature review agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { LITREVIEW_CONFIG } from "@/components/agents/agent-configs";

/** Literature review agent page; renders AgentPageTemplate with LITREVIEW_CONFIG. */
export default function LitReviewPage() {
  return <AgentPageTemplate config={LITREVIEW_CONFIG} />;
}
