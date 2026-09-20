/**
 * Design Agent Page (/projects/[projectId]/design)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to DESIGN_CONFIG.
 * - Provides the experimental design agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { DESIGN_CONFIG } from "@/components/agents/agent-configs";

/** Design agent page; renders AgentPageTemplate with DESIGN_CONFIG. */
export default function DesignPage() {
  return <AgentPageTemplate config={DESIGN_CONFIG} />;
}
