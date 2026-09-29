/**
 * Plugin Install (lib/plugins/install.ts)
 *
 * Functionality:
 * - Persists plugin installs and active prompt-pack selections in Postgres via `/api/plugins`.
 * - Validates manifests, checks tool-name conflicts, and rehydrates the runtime registry.
 * - Supports enable/disable, uninstall cleanup, and listing packs available per agent.
 *
 * Side effects:
 * - Writes through the plugin client and mutates the in-memory registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { LocalPluginInstall } from "@/lib/types/domain";
import {
  deleteSelection,
  listInstalls,
  listSelections,
  putSelection,
  uninstall as deleteInstall,
  upsertInstall,
} from "@/lib/client/plugins";
import { parsePluginManifest } from "./schema";
import {
  assertToolsInstallable,
  getInstalledSnapshot,
  rehydrateFromInstalls,
} from "./registry";
import { packRef, parsePackRef } from "./ids";
import type { PluginManifest } from "./types";

// Active prompt-pack selections cached for the synchronous-ish resolver.
const selectionCache = new Map<string, string>();

/** List all persisted plugin installs sorted by id. */
export async function listInstalledPlugins(): Promise<LocalPluginInstall[]> {
  const rows = await listInstalls();
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/** Load persisted installs + selections and rebuild the runtime plugin registry. */
export async function bootstrapPlugins(): Promise<void> {
  const [rows, selections] = await Promise.all([listInstalls(), listSelections()]);
  rehydrateFromInstalls(rows);
  selectionCache.clear();
  for (const selection of selections) {
    selectionCache.set(selection.id, selection.packRef);
  }
}

/** Return the cached active pack ref for an agent, defaulting to `builtin`. */
export function getCachedPackSelection(agentId: string): string | undefined {
  return selectionCache.get(agentId);
}

/** Validate, persist, and rehydrate a plugin from a raw manifest input. */
export async function installPlugin(
  input: unknown
): Promise<{ ok: true; pluginId: string } | { ok: false; error: string }> {
  const parsed = parsePluginManifest(input);
  if (!parsed.ok) return parsed;

  const manifest = parsed.data;
  try {
    assertToolsInstallable(manifest.id, manifest);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "tool conflict" };
  }

  const existing = getInstalledSnapshot().find((row) => row.id === manifest.id);
  await upsertInstall({
    id: manifest.id,
    version: manifest.version,
    enabled: existing?.enabled ?? true,
    manifest,
  });
  rehydrateFromInstalls(await listInstalledPlugins());
  return { ok: true, pluginId: manifest.id };
}

/** Delete a plugin install and any prompt-pack selections referencing it. */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  await deleteInstall(pluginId);
  for (const entry of Array.from(selectionCache.entries())) {
    const [agentId, ref] = entry;
    if (parsePackRef(ref)?.pluginId === pluginId) selectionCache.delete(agentId);
  }
  rehydrateFromInstalls(await listInstalledPlugins());
}

/** Toggle whether an installed plugin contributes agents, packs, and tools. */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const existing = getInstalledSnapshot().find((row) => row.id === pluginId);
  if (!existing) throw new Error(`Plugin not installed: ${pluginId}`);
  await upsertInstall({
    id: existing.id,
    version: existing.version,
    enabled,
    manifest: existing.manifest,
  });
  rehydrateFromInstalls(await listInstalledPlugins());
}

/** Select the active prompt pack for an agent, validating the pack and its override. */
export async function setActivePromptPack(
  agentId: string,
  packRefValue: "builtin" | string
): Promise<void> {
  if (packRefValue === "builtin") {
    await deleteSelection(agentId);
    selectionCache.delete(agentId);
    return;
  }
  const parsed = parsePackRef(packRefValue);
  if (!parsed) throw new Error(`Invalid pack ref: ${packRefValue}`);
  const install = getInstalledSnapshot().find((row) => row.id === parsed.pluginId);
  if (!install?.enabled) throw new Error(`Pack plugin not enabled: ${parsed.pluginId}`);
  const pack = install.manifest.promptPacks?.find((p) => p.key === parsed.packKey);
  if (!pack) throw new Error(`Pack not found: ${packRefValue}`);
  if (!pack.overrides[agentId]) {
    throw new Error(`Pack ${packRefValue} has no override for agent ${agentId}`);
  }

  await putSelection(agentId, packRefValue);
  selectionCache.set(agentId, packRefValue);
}

/** Return the active pack ref for an agent, defaulting to `builtin`. */
export async function getActivePromptPack(agentId: string): Promise<string> {
  return selectionCache.get(agentId) ?? "builtin";
}

/** List enabled prompt packs that provide an override for the given agent. */
export function listPacksForAgent(
  agentId: string
): Array<{ packRef: string; name: string; pluginId: string }> {
  const out: Array<{ packRef: string; name: string; pluginId: string }> = [];
  for (const install of getInstalledSnapshot()) {
    if (!install.enabled) continue;
    for (const pack of install.manifest.promptPacks ?? []) {
      if (pack.overrides[agentId]) {
        out.push({
          packRef: packRef(install.id, pack.key),
          name: pack.name,
          pluginId: install.id,
        });
      }
    }
  }
  return out;
}

export type { PluginManifest };
