/**
 * Write Agent Page (/projects/[projectId]/write)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to WRITE_CONFIG.
 * - Provides the paper-writing/polishing agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { WRITE_CONFIG } from "@/components/agents/agent-configs";

/** Write agent page; renders AgentPageTemplate with WRITE_CONFIG. */
export default function WritePage() {
  return <AgentPageTemplate config={WRITE_CONFIG} />;
}
