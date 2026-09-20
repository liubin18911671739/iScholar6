/**
 * Data Agent Page (/projects/[projectId]/data)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to DATA_CONFIG.
 * - Provides the data-collection agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { DATA_CONFIG } from "@/components/agents/agent-configs";

/** Data agent page; renders AgentPageTemplate with DATA_CONFIG. */
export default function DataPage() {
  return <AgentPageTemplate config={DATA_CONFIG} />;
}
