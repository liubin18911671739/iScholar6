/**
 * Plugin client (lib/client/plugins.ts)
 *
 * Typed browser client for `/api/plugins/*` (per-user installs + prompt packs).
 */

import type { LocalPluginInstall, LocalPromptPackSelection } from "@/lib/types/domain";
import type { PluginManifest } from "@/lib/plugins/types";
import { request } from "@/lib/client/http";

const BASE = "/api/plugins";

type InstallRow = {
  id: string;
  version: string;
  enabled: boolean;
  manifest: PluginManifest;
  contentHash?: string | null;
  installedAt: string;
  updatedAt: string;
};

type SelectionRow = { agentId: string; packRef: string; updatedAt: string };

/** List the caller's installed plugins. */
export async function listInstalls(): Promise<LocalPluginInstall[]> {
  const rows = await request<InstallRow[]>(BASE);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    enabled: row.enabled,
    manifest: row.manifest,
    contentHash: row.contentHash ?? undefined,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  }));
}

/** Install or update a plugin for the caller. */
export async function upsertInstall(input: {
  id: string;
  version: string;
  enabled?: boolean;
  manifest: PluginManifest;
  contentHash?: string;
}): Promise<LocalPluginInstall> {
  const row = await request<InstallRow>(BASE, { method: "POST", body: JSON.stringify(input) });
  return { ...row, contentHash: row.contentHash ?? undefined };
}

/** Uninstall a plugin (also drops its prompt-pack selections). */
export async function uninstall(pluginId: string): Promise<void> {
  await request(`${BASE}/${encodeURIComponent(pluginId)}`, { method: "DELETE" });
}

/** List the caller's prompt-pack selections. */
export async function listSelections(): Promise<LocalPromptPackSelection[]> {
  const rows = await request<SelectionRow[]>(`${BASE}/prompt-packs`);
  return rows.map((row) => ({ id: row.agentId, packRef: row.packRef, updatedAt: row.updatedAt }));
}

/** Set the active prompt pack for one agent. */
export async function putSelection(agentId: string, packRef: string): Promise<LocalPromptPackSelection> {
  const row = await request<SelectionRow>(`${BASE}/prompt-packs/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    body: JSON.stringify({ packRef }),
  });
  return { id: row.agentId, packRef: row.packRef, updatedAt: row.updatedAt };
}

/** Clear the prompt-pack selection for one agent. */
export async function deleteSelection(agentId: string): Promise<void> {
  await request(`${BASE}/prompt-packs/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}
