/**
 * Generic Agent Page (components/plugins/generic-agent-page.tsx)
 *
 * Functionality:
 * - Renders a full module page for an installed plugin agent using the shared AgentPageTemplate.
 * - Bootstraps and subscribes to the plugin registry, then resolves the agent by id.
 * - Builds the run input from declared fields (coercing number fields) and targets the `plugin` manuscript section.
 *
 * Notes:
 * - Shows loading and "plugin agent not found" states while the registry is unavailable.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useEffect, useState } from "react";
import { AgentPageTemplate, type AgentPageConfig, type InputProps } from "@/components/agents/agent-page-template";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensurePluginsBootstrapped } from "@/lib/plugins/bootstrap";
import { getPluginAgent, isRegisteredPluginAgent, subscribePluginRegistry } from "@/lib/plugins/registry";
import type { RegisteredPluginAgent } from "@/lib/plugins/types";
import { GenericPluginAgentInputs } from "./generic-agent-inputs";

/** Read-only panel summarizing where plugin agent output is stored. */
function PluginOutputPanel({ agentId }: { agentId: string; projectId: string }) {
  const agent = getPluginAgent(agentId);
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {agent?.name ?? agentId}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {agent?.description ?? "Custom plugin agent"}
        <p className="mt-2">
          Approved outputs are saved as manuscript blocks under section{" "}
          <code className="rounded bg-muted px-1">plugin</code>.
        </p>
      </CardContent>
    </Card>
  );
}

/** Adapts a registered plugin agent into an AgentPageConfig for the shared template. */
function buildConfig(agent: RegisteredPluginAgent): AgentPageConfig {
  const fields = agent.inputFields;
  const Inputs = (props: InputProps) => (
    <GenericPluginAgentInputs {...props} fields={fields} />
  );

  return {
    agentId: agent.fullId,
    InputsComponent: Inputs,
    OutputComponent: ({ projectId }) => (
      <PluginOutputPanel agentId={agent.fullId} projectId={projectId} />
    ),
    buildRunInput: (fieldState) => {
      const input: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = fieldState[field.name] ?? field.defaultValue ?? "";
        if (field.type === "number" && raw !== "") {
          const n = Number(raw);
          input[field.name] = Number.isFinite(n) ? n : raw;
        } else {
          input[field.name] = raw;
        }
      }
      return input;
    },
    manuscriptSection: `plugin:${agent.key}`,
    manuscriptOrder: 100,
  };
}

/** Module page entry point for a dynamically registered plugin agent. */
export function GenericPluginAgentPage({ agentId }: { agentId: string }) {
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensurePluginsBootstrapped().then(() => {
      if (!cancelled) setReady(true);
    });
    const unsub = subscribePluginRegistry(() => setTick((n) => n + 1));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // tick/ready force re-read after bootstrap and registry rehydrate
  const agent = ready ? getPluginAgent(agentId) : undefined;
  void tick;
  const config = agent ? buildConfig(agent) : null;

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading plugin…
      </div>
    );
  }

  if (!agent || !config || !isRegisteredPluginAgent(agentId)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-medium">Plugin agent not found</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Install or enable the plugin that provides{" "}
          <code className="rounded bg-muted px-1">{agentId}</code> in Settings → Plugins.
        </p>
      </div>
    );
  }

  return <AgentPageTemplate config={config} />;
}
