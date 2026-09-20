/**
 * Agent Registry (lib/ai/agents/registry.ts)
 *
 * Functionality:
 * - Defines the closed set of built-in agent ids and their display metadata.
 * - Describes each agent's optional upstream `contextFrom` sources.
 * - Provides id guards (`isBuiltInAgent`, `isValidAgent`) and soft meta lookup.
 * - Lets plugins register a late-bound meta resolver without circular imports.
 *
 * Notes:
 * - `AgentId` also accepts plugin keys of the form `p.<pluginId>.<key>`.
 *
 * @author mrpi
 * @date 2026-09-16
 */

/** Compile-time closed set — use for exhaustiveness in built-in switches. */
export const BUILTIN_AGENT_IDS = [
  "topic",
  "litreview",
  "design",
  "data",
  "write",
  "submit",
  "rebuttal",
] as const;

/** Union of the built-in agent ids derived from {@link BUILTIN_AGENT_IDS}. */
export type BuiltInAgentId = (typeof BUILTIN_AGENT_IDS)[number];

/**
 * Runtime agent key: built-in or plugin (`p.<pluginId>.<key>`).
 * Prefer `BuiltInAgentId` for exhaustive switches over built-ins only.
 */
export type AgentId = BuiltInAgentId | (string & {});

/** @deprecated alias — same as BUILTIN_AGENT_IDS; kept for migration. */
export const AGENT_IDS = BUILTIN_AGENT_IDS;

/** Declares an upstream agent whose approved output is injected as context. */
export interface AgentContextSource {
  /** Built-in or plugin agent id. */
  agent: string;
  maxChars?: number;
}

/** Display metadata for a single agent, including optional context sources. */
export interface AgentMeta {
  name: string;
  description: string;
  /** Optional upstream agents whose approved output is injected as context. */
  contextFrom?: AgentContextSource[];
}

/** Metadata table keyed by built-in agent id. */
export const AGENT_META: Record<BuiltInAgentId, AgentMeta> = {
  topic: {
    name: "TopicScout",
    description: "AI驱动的选题发现与趋势分析",
    // No upstream — fully independent
  },
  litreview: {
    name: "LitReview",
    description: "系统性文献检索与综述",
    contextFrom: [{ agent: "topic", maxChars: 1000 }],
  },
  design: {
    name: "ResearchDesigner",
    description: "研究设计与假设构建",
    contextFrom: [{ agent: "topic", maxChars: 1000 }],
  },
  data: {
    name: "DataPilot",
    description: "数据收集、清洗与分析",
    contextFrom: [{ agent: "topic", maxChars: 1000 }],
  },
  write: {
    name: "IMRaDWriter",
    description: "IMRaD格式论文撰写",
    // Context is optional — editor reads from manuscript blocks directly
  },
  submit: {
    name: "SubmitMatch",
    description: "期刊匹配与投稿打包",
  },
  rebuttal: {
    name: "RebuttalShow",
    description: "审稿意见回复与修改",
  },
};

/** Type guard for built-in agent ids. */
export function isBuiltInAgent(id: string): id is BuiltInAgentId {
  return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

/** Built-in only (legacy name). Prefer isAgentPathAllowed / isRegisteredAgent for plugins. */
export function isValidAgent(id: string): id is BuiltInAgentId {
  return isBuiltInAgent(id);
}

/**
 * Soft meta lookup: built-in table first, then plugin registry (client-side).
 * Safe to call when plugins are not bootstrapped (returns undefined for plugins).
 */
export function getAgentMeta(id: string): AgentMeta | undefined {
  if (isBuiltInAgent(id)) return AGENT_META[id];
  // Dynamic import would be async; use a late-bound getter registered by plugins.
  return pluginMetaResolver?.(id);
}

// Late-bound resolver so plugins can extend meta lookup without a circular import.
type PluginMetaResolver = (id: string) => AgentMeta | undefined;
let pluginMetaResolver: PluginMetaResolver | undefined;

/** Called from plugin bootstrap/registry to wire soft meta lookup without circular imports. */
export function registerPluginMetaResolver(resolver: PluginMetaResolver): void {
  pluginMetaResolver = resolver;
}
