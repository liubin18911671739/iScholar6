/**
 * Plugin Install (lib/plugins/install.ts)
 *
 * Functionality:
 * - Persists plugin installs and active prompt-pack selections in Dexie (`localDB`).
 * - Validates manifests, checks tool-name conflicts, and rehydrates the runtime registry.
 * - Supports enable/disable, uninstall cleanup, and listing packs available per agent.
 *
 * Side effects:
 * - Writes to `pluginInstalls` / `promptPackSelections` tables and mutates the in-memory registry.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { localDB } from "@/lib/local/db";
import type { LocalPluginInstall, LocalPromptPackSelection } from "@/lib/local/db";
import { hashContent } from "@/lib/audit/ledger";
import { parsePluginManifest } from "./schema";
import {
  assertToolsInstallable,
  getInstalledSnapshot,
  rehydrateFromInstalls,
} from "./registry";
import { packRef, parsePackRef } from "./ids";
import type { PluginManifest } from "./types";

// Current timestamp helper for install/selection bookkeeping.
function now() {
  return new Date().toISOString();
}

/** List all persisted plugin installs sorted by id. */
export async function listInstalledPlugins(): Promise<LocalPluginInstall[]> {
  const rows = await localDB.pluginInstalls.toArray();
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/** Load persisted installs and rebuild the runtime plugin registry. */
export async function bootstrapPlugins(): Promise<void> {
  const rows = await listInstalledPlugins();
  rehydrateFromInstalls(rows);
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

  const existing = await localDB.pluginInstalls.get(manifest.id);
  const ts = now();
  const contentHash = await hashContent(JSON.stringify(manifest));
  const row: LocalPluginInstall = {
    id: manifest.id,
    version: manifest.version,
    enabled: existing?.enabled ?? true,
    installedAt: existing?.installedAt ?? ts,
    updatedAt: ts,
    manifest,
    contentHash,
  };

  await localDB.pluginInstalls.put(row);
  const all = await listInstalledPlugins();
  rehydrateFromInstalls(all);
  return { ok: true, pluginId: manifest.id };
}

/** Delete a plugin install and any prompt-pack selections referencing it. */
export async function uninstallPlugin(pluginId: string): Promise<void> {
  await localDB.pluginInstalls.delete(pluginId);

  // Drop pack selections that reference this plugin.
  const selections = await localDB.promptPackSelections.toArray();
  for (const sel of selections) {
    const parsed = parsePackRef(sel.packRef);
    if (parsed?.pluginId === pluginId) {
      await localDB.promptPackSelections.delete(sel.id);
    }
  }

  rehydrateFromInstalls(await listInstalledPlugins());
}

/** Toggle whether an installed plugin contributes agents, packs, and tools. */
export async function setPluginEnabled(
  pluginId: string,
  enabled: boolean
): Promise<void> {
  const existing = await localDB.pluginInstalls.get(pluginId);
  if (!existing) throw new Error(`Plugin not installed: ${pluginId}`);
  await localDB.pluginInstalls.update(pluginId, {
    enabled,
    updatedAt: now(),
  });
  rehydrateFromInstalls(await listInstalledPlugins());
}

/** Select the active prompt pack for an agent, validating the pack and its override. */
export async function setActivePromptPack(
  agentId: string,
  packRefValue: "builtin" | string
): Promise<void> {
  if (packRefValue === "builtin") {
    await localDB.promptPackSelections.delete(agentId);
    return;
  }
  const parsed = parsePackRef(packRefValue);
  if (!parsed) throw new Error(`Invalid pack ref: ${packRefValue}`);
  const install = await localDB.pluginInstalls.get(parsed.pluginId);
  if (!install?.enabled) throw new Error(`Pack plugin not enabled: ${parsed.pluginId}`);
  const pack = install.manifest.promptPacks?.find((p) => p.key === parsed.packKey);
  if (!pack) throw new Error(`Pack not found: ${packRefValue}`);
  if (!pack.overrides[agentId]) {
    throw new Error(`Pack ${packRefValue} has no override for agent ${agentId}`);
  }

  const row: LocalPromptPackSelection = {
    id: agentId,
    packRef: packRefValue,
    updatedAt: now(),
  };
  await localDB.promptPackSelections.put(row);
}

/** Return the active pack ref for an agent, defaulting to `builtin`. */
export async function getActivePromptPack(agentId: string): Promise<string> {
  const row = await localDB.promptPackSelections.get(agentId);
  return row?.packRef ?? "builtin";
}

/** List enabled prompt packs that provide an override for the given agent. */
export function listPacksForAgent(agentId: string): Array<{ packRef: string; name: string; pluginId: string }> {
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
