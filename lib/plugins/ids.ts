/**
 * Plugin IDs (lib/plugins/ids.ts)
 *
 * Functionality:
 * - Validates and composes plugin ids, agent keys, and full plugin agent ids (`p.<plugin>.<key>`).
 * - Parses pack references (`<pluginId>/<packKey>`) and decides agent-path allowlisting.
 * - Detects ids reserved by built-in agents and exposes shared id regexes.
 *
 * Notes:
 * - Collaborates with `@/lib/ai/agents/registry` for built-in agent ids.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import {
  BUILTIN_AGENT_IDS,
  type BuiltInAgentId,
  isBuiltInAgent,
} from "@/lib/ai/agents/registry";

export { isBuiltInAgent, type BuiltInAgentId };

/** Plugin agent full id: `p.<pluginId>.<key>` */
const PLUGIN_AGENT_ID_RE = /^p\.([a-z][a-z0-9-]{0,31})\.([a-z][a-z0-9_-]{0,31})$/;

/** Plugin id slug: `^[a-z][a-z0-9-]{1,31}$` (at least 2 chars). */
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

/** Local agent key inside a plugin. */
const AGENT_KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/;

/** Safe path segment for agent API (built-in or plugin). */
const AGENT_PATH_RE = /^[a-z][a-z0-9._-]{1,63}$/;

/** True when `id` is a valid plugin id slug. */
export function isValidPluginId(id: string): boolean {
  return PLUGIN_ID_RE.test(id);
}

/** True when `key` is a valid non-built-in plugin agent key. */
export function isValidAgentKey(key: string): boolean {
  return AGENT_KEY_RE.test(key) && !isBuiltInAgent(key);
}

/** Compose the full plugin agent id from plugin id and local key. */
export function toPluginAgentId(pluginId: string, key: string): string {
  return `p.${pluginId}.${key}`;
}

/** True when `id` matches the `p.<pluginId>.<key>` plugin agent format. */
export function isPluginAgentId(id: string): boolean {
  return PLUGIN_AGENT_ID_RE.test(id);
}

/** Split a plugin agent id into its plugin id and local key, or `null`. */
export function parsePluginAgentId(
  id: string
): { pluginId: string; key: string } | null {
  const match = PLUGIN_AGENT_ID_RE.exec(id);
  if (!match) return null;
  return { pluginId: match[1], key: match[2] };
}

/**
 * Server/client path allowlist for `/api/agents/[agent]`.
 * Built-ins always allowed; plugin ids must match `p.<pluginId>.<key>`.
 */
export function isAgentPathAllowed(id: string): boolean {
  if (isBuiltInAgent(id)) return true;
  if (isPluginAgentId(id)) return true;
  // Transitional: safe slug only (no spaces / path traversal).
  return AGENT_PATH_RE.test(id) && !id.includes("..");
}

/** True when `id` belongs to a built-in agent and is therefore reserved. */
export function isReservedAgentId(id: string): boolean {
  return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

/** Build the canonical `<pluginId>/<packKey>` prompt-pack reference. */
export function packRef(pluginId: string, packKey: string): string {
  return `${pluginId}/${packKey}`;
}

/** Split a pack reference into plugin id and pack key, or `null` for `builtin`. */
export function parsePackRef(
  ref: string
): { pluginId: string; packKey: string } | null {
  if (ref === "builtin") return null;
  const idx = ref.indexOf("/");
  if (idx <= 0 || idx === ref.length - 1) return null;
  return { pluginId: ref.slice(0, idx), packKey: ref.slice(idx + 1) };
}
