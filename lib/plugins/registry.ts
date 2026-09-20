/**
 * Plugin Registry (lib/plugins/registry.ts)
 *
 * Functionality:
 * - Holds the in-memory maps of installed plugins, plugin agents, and prompt packs.
 * - Rehydrates those maps from install rows and (un)registers manifest MCP tools.
 * - Exposes lookups, tool-conflict validation, and a subscription hook for changes.
 *
 * Notes:
 * - Bridges to `@/lib/ai/agents/registry` (meta resolver) and `@/lib/mcp/gateway` (tool registry).
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { AgentMeta } from "@/lib/ai/agents/registry";
import { registerPluginMetaResolver } from "@/lib/ai/agents/registry";
import {
  getTool,
  registerTool,
  unregisterByPlugin,
  unregisterTool,
} from "@/lib/mcp/gateway";
import { bindDeclarativeTool } from "./mcp-declarative";
import { packRef, toPluginAgentId } from "./ids";
import type {
  LocalPluginInstall,
  PluginManifest,
  PromptPackDefinition,
  PromptPackOverride,
  RegisteredPluginAgent,
} from "./types";

type Listener = () => void;

const agents = new Map<string, RegisteredPluginAgent>();
const packs = new Map<string, { pluginId: string; pack: PromptPackDefinition }>();
const installs = new Map<string, LocalPluginInstall>();
const listeners = new Set<Listener>();

// Notify subscribers, isolating listener failures so one error can't break the rest.
function emit() {
  Array.from(listeners).forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error("[plugins] listener error", e);
    }
  });
}

/** Subscribe to registry changes; returns an unsubscribe function. */
export function subscribePluginRegistry(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot of installed plugins (enabled and disabled), sorted by id. */
export function getInstalledSnapshot(): LocalPluginInstall[] {
  return Array.from(installs.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** Look up a registered plugin agent by its full id. */
export function getPluginAgent(fullId: string): RegisteredPluginAgent | undefined {
  return agents.get(fullId);
}

/** List all currently registered plugin agents. */
export function listPluginAgents(): RegisteredPluginAgent[] {
  return Array.from(agents.values());
}

/** True when a plugin agent with the given full id is registered. */
export function isRegisteredPluginAgent(id: string): boolean {
  return agents.has(id);
}

/** Project a plugin agent into the `AgentMeta` shape used by the agent registry. */
export function getPluginAgentMeta(id: string): AgentMeta | undefined {
  const agent = agents.get(id);
  if (!agent) return undefined;
  return {
    name: agent.name,
    description: agent.description,
    contextFrom: agent.contextFrom?.map((c) => ({
      agent: c.agent,
      maxChars: c.maxChars,
    })),
  };
}

// Wire soft meta lookup without circular init races.
registerPluginMetaResolver((id) => getPluginAgentMeta(id));

/** List all registered prompt packs with their plugin and pack ref. */
export function listPromptPacks(): Array<{
  packRef: string;
  pluginId: string;
  pack: PromptPackDefinition;
}> {
  return Array.from(packs.entries()).map(([ref, value]) => ({
    packRef: ref,
    pluginId: value.pluginId,
    pack: value.pack,
  }));
}

/** Return the override a prompt pack defines for an agent, if any. */
export function findPackOverride(
  packRefValue: string,
  agentId: string
): PromptPackOverride | undefined {
  const entry = packs.get(packRefValue);
  return entry?.pack.overrides[agentId];
}

// Remove all plugin-sourced tools currently tracked by loaded installs.
function clearPluginTools() {
  // Remove all tools currently marked as plugin-sourced.
  // Gateway helpers handle exact names; we track via installs.
  Array.from(installs.values()).forEach((install) => {
    for (const tool of install.manifest.mcpTools ?? []) {
      unregisterTool(tool.name);
    }
    unregisterByPlugin(install.id);
  });
}

// Register a manifest's MCP tools, rejecting conflicts with built-ins/other plugins.
function registerManifestTools(pluginId: string, manifest: PluginManifest) {
  for (const toolDef of manifest.mcpTools ?? []) {
    const existing = getTool(toolDef.name);
    if (existing && existing.source !== "plugin") {
      throw new Error(`MCP tool name reserved by built-in: ${toolDef.name}`);
    }
    if (existing?.pluginId && existing.pluginId !== pluginId) {
      throw new Error(`MCP tool name already used by plugin ${existing.pluginId}: ${toolDef.name}`);
    }
    registerTool(bindDeclarativeTool(toolDef, pluginId));
  }
}

/**
 * Rebuild in-memory maps from install rows (enabled only contribute agents/packs/tools).
 */
export function rehydrateFromInstalls(rows: LocalPluginInstall[]): void {
  // Unregister previous plugin tools first.
  Array.from(installs.values()).forEach((install) => {
    for (const tool of install.manifest.mcpTools ?? []) {
      const current = getTool(tool.name);
      if (current?.source === "plugin") unregisterTool(tool.name);
    }
  });
  // Reference kept to avoid an unused-symbol warning; cleanup handled inline above.
  void clearPluginTools;

  agents.clear();
  packs.clear();
  installs.clear();

  for (const row of rows) {
    installs.set(row.id, row);
    if (!row.enabled) continue;

    for (const agent of row.manifest.agents ?? []) {
      const fullId = toPluginAgentId(row.id, agent.key);
      agents.set(fullId, {
        ...agent,
        fullId,
        pluginId: row.id,
      });
    }

    for (const pack of row.manifest.promptPacks ?? []) {
      packs.set(packRef(row.id, pack.key), { pluginId: row.id, pack });
    }

    try {
      registerManifestTools(row.id, row.manifest);
    } catch (e) {
      console.error(`[plugins] failed to register tools for ${row.id}`, e);
    }
  }

  emit();
}

/** Validate tool names against currently registered built-ins / other plugins. */
export function assertToolsInstallable(
  pluginId: string,
  manifest: PluginManifest
): void {
  for (const tool of manifest.mcpTools ?? []) {
    const existing = getTool(tool.name);
    if (!existing) continue;
    if (existing.source !== "plugin") {
      throw new Error(`MCP tool name reserved by built-in: ${tool.name}`);
    }
    if (existing.pluginId && existing.pluginId !== pluginId) {
      throw new Error(`MCP tool name already used by plugin ${existing.pluginId}: ${tool.name}`);
    }
  }
}

/** Test helper: wipe registry without Dexie. */
export function __resetPluginRegistryForTests(): void {
  Array.from(installs.values()).forEach((install) => {
    for (const tool of install.manifest.mcpTools ?? []) {
      const current = getTool(tool.name);
      if (current?.source === "plugin") unregisterTool(tool.name);
    }
  });
  agents.clear();
  packs.clear();
  installs.clear();
  emit();
}
