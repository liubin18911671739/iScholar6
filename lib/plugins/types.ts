/**
 * Plugin Types (lib/plugins/types.ts)
 *
 * Functionality:
 * - Declares the shared TypeScript types for plugin manifests, agents, prompt packs, and MCP tools.
 * - Defines local Dexie row shapes for plugin installs and prompt-pack selections.
 * - Describes the resolved runtime plugin agent shape.
 *
 * Notes:
 * - Pure type module; depends on `@/lib/ai/agents/registry` for built-in agent ids.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { BuiltInAgentId } from "@/lib/ai/agents/registry";

/** Manifest schema version for v1 plugins. */
export type PluginSchemaVersion = 1;

/** Describes one input field a plugin agent renders in its form. */
export interface InputFieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

/** Declarative plugin agent: identity, prompts, inputs, and context wiring. */
export interface PluginAgentDefinition {
  /** Local key; full agent id = `p.<pluginId>.<key>`. */
  key: string;
  name: string;
  description: string;
  systemPrompt: string;
  /** Simple mustache-like template: `{{fieldName}}`. */
  userPromptTemplate: string;
  inputFields: InputFieldDef[];
  contextFrom?: { agent: string; maxChars?: number }[];
  /** Optional JSON Schema object for structured parse (best-effort). */
  outputSchema?: Record<string, unknown>;
  estimatedTokens?: number;
  /** UI hint only — related built-in workflow stage. */
  relatedBuiltIn?: BuiltInAgentId;
}

/** Optional system/user prompt replacements a pack provides for an agent. */
export interface PromptPackOverride {
  systemPrompt?: string;
  userPromptTemplate?: string;
}

/** A named prompt pack mapping agent ids to prompt overrides. */
export interface PromptPackDefinition {
  key: string;
  name: string;
  description?: string;
  /** agentId (built-in or full plugin id) → overrides */
  overrides: Record<string, PromptPackOverride>;
}

/** Minimal JSON Schema object subset accepted for declarative tool parameters. */
export type JsonSchemaObject = {
  type: "object";
  properties?: Record<
    string,
    {
      type?: "string" | "number" | "boolean" | "array";
      description?: string;
      items?: { type?: "string" | "number" | "boolean" };
    }
  >;
  required?: string[];
};

/** Declarative MCP tool: parameters plus the HTTP request to execute. */
export interface DeclarativeMcpToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  http: {
    method: "GET" | "POST";
    url: string;
    headers?: Record<string, string>;
    bodyTemplate?: "json-params";
    timeoutMs?: number;
  };
  resultPath?: string;
}

/** Top-level v1 plugin manifest: metadata plus agents, packs, and tools. */
export interface PluginManifest {
  schemaVersion: PluginSchemaVersion;
  id: string;
  version: string;
  name: string;
  description?: string;
  author?: string;
  agents?: PluginAgentDefinition[];
  promptPacks?: PromptPackDefinition[];
  mcpTools?: DeclarativeMcpToolDefinition[];
}

/** Persisted Dexie row for an installed plugin and its enablement state. */
export interface LocalPluginInstall {
  id: string;
  version: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  manifest: PluginManifest;
  contentHash?: string;
}

/** Persisted Dexie row for an agent's selected prompt pack. */
export interface LocalPromptPackSelection {
  /** agentId (built-in or full plugin agent id) */
  id: string;
  /** `"builtin"` or `"${pluginId}/${packKey}"` */
  packRef: string;
  updatedAt: string;
}

/** Resolved plugin agent with full runtime id. */
export interface RegisteredPluginAgent extends PluginAgentDefinition {
  fullId: string;
  pluginId: string;
}
