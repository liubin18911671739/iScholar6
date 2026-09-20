/**
 * Dynamic Agent Route (/projects/[projectId]/[agentId])
 *
 * Functionality:
 * - Resolves plugin agent ids (`p.<pluginId>.<key>`) and renders GenericPluginAgentPage.
 * - Redirects built-in agents to their static route if they land on this segment.
 * - Returns notFound() when the plugin system is disabled or the id is invalid.
 *
 * Notes:
 * - Plugin detection relies on isPluginAgentId/isPluginSystemEnabled.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import { isBuiltInAgent } from "@/lib/ai/agents/registry";
import { isPluginAgentId } from "@/lib/plugins/ids";
import { isPluginSystemEnabled } from "@/lib/plugins/flags";
import { GenericPluginAgentPage } from "@/components/plugins/generic-agent-page";

/**
 * Dynamic agent page for plugin agents (`p.<pluginId>.<key>`).
 * Built-in agents keep static routes; if they somehow hit this segment, redirect.
 */
export default function DynamicAgentPage() {
  const params = useParams<{ projectId: string; agentId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const agentId = decodeURIComponent(params.agentId ?? "");

  useEffect(() => {
    if (isBuiltInAgent(agentId) && projectId) {
      router.replace(`/projects/${projectId}/${agentId}`);
    }
  }, [agentId, projectId, router]);

  if (isBuiltInAgent(agentId)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  if (!isPluginSystemEnabled() || !isPluginAgentId(agentId)) {
    notFound();
  }

  return <GenericPluginAgentPage agentId={agentId} />;
}
