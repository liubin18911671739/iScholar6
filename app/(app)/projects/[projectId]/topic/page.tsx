/**
 * Topic Agent Page (/projects/[projectId]/topic)
 *
 * Functionality:
 * - Renders the shared AgentPageTemplate wired to TOPIC_CONFIG.
 * - Provides the topic-generation agent workflow for a project.
 *
 * Notes:
 * - Delegates all UI and run logic to AgentPageTemplate.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { AgentPageTemplate } from "@/components/agents/agent-page-template";
import { TOPIC_CONFIG } from "@/components/agents/agent-configs";

/** Topic agent page; renders AgentPageTemplate with TOPIC_CONFIG. */
export default function TopicPage() {
  return <AgentPageTemplate config={TOPIC_CONFIG} />;
}
