/**
 * Plugins Index (lib/plugins/index.ts)
 *
 * Functionality:
 * - Aggregates the public plugin-system API into a single barrel module.
 * - Re-exports feature flags, id helpers, manifest schema, prompt resolution, and install/registry APIs.
 * - Re-exports shared plugin manifest and runtime types.
 *
 * Notes:
 * - Import from here rather than reaching into individual plugin modules.
 *
 * @author mrpi
 * @date 2026-09-16
 */

export { isPluginSystemEnabled } from "./flags";
export {
  isAgentPathAllowed,
  isBuiltInAgent,
  isPluginAgentId,
  toPluginAgentId,
  parsePluginAgentId,
  packRef,
  parsePackRef,
} from "./ids";
export { parsePluginManifest, MANIFEST_LIMITS } from "./schema";
export {
  resolveSystemPrompt,
  resolveUserPrompt,
  applyTemplate,
  getBuiltinSystemPrompt,
  buildBuiltinUserPrompt,
} from "./prompt-resolve";
export {
  installPlugin,
  uninstallPlugin,
  setPluginEnabled,
  setActivePromptPack,
  getActivePromptPack,
  listInstalledPlugins,
  listPacksForAgent,
  bootstrapPlugins,
} from "./install";
export {
  getPluginAgent,
  listPluginAgents,
  isRegisteredPluginAgent,
  getPluginAgentMeta,
  listPromptPacks,
  findPackOverride,
  rehydrateFromInstalls,
  subscribePluginRegistry,
  getInstalledSnapshot,
} from "./registry";
export { ensurePluginsBootstrapped } from "./bootstrap";
export { bindDeclarativeTool, assertSafeHttpsUrl, isBlockedHost, jsonSchemaToZod } from "./mcp-declarative";
export type {
  PluginManifest,
  PluginAgentDefinition,
  PromptPackDefinition,
  DeclarativeMcpToolDefinition,
  LocalPluginInstall,
  LocalPromptPackSelection,
  RegisteredPluginAgent,
  InputFieldDef,
} from "./types";
