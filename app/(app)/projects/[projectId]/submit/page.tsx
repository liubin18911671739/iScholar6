/**
 * Submit Agent Page (/projects/[projectId]/submit)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to SUBMIT_CONFIG.
 * - Provides the journal-submission agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { SUBMIT_CONFIG } from "@/components/agents/agent-configs";

/** Submit agent page; renders AgentPageTemplate with SUBMIT_CONFIG. */
export default function SubmitPage() {
  return <AgentPageTemplate config={SUBMIT_CONFIG} />;
}
