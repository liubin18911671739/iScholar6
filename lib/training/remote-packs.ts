/**
 * Remote Task Packs (lib/training/remote-packs.ts)
 *
 * Functionality:
 * - Loads task packs from the Supabase `training_task_packs` table (`loadRemotePacks`).
 * - Flattens a validated pack into task-definition rows for storage (`packToDefinitionRows`).
 * - Provides a SHA-256 content hash helper (`simpleContentHash`).
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingTaskPackLike } from "./task-catalog";
import { packTaskId } from "./task-catalog";
import type { TrainingTaskPackInput } from "./task-pack-schema";

/** Fetch remote task packs (newest first) and map them to catalog-like shapes. */
export async function loadRemotePacks(
  client: SupabaseClient
): Promise<TrainingTaskPackLike[]> {
  const { data, error } = await client
    .from("training_task_packs")
    .select("pack_key, name, description, version, manifest")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => {
    const manifest = row.manifest as TrainingTaskPackInput;
    return {
      key: (manifest?.key as string) || (row.pack_key as string),
      name: (manifest?.name as string) || (row.name as string),
      description: (manifest?.description as string | undefined) ?? row.description ?? undefined,
      version: (manifest?.version as string) || (row.version as string),
      tasks: (manifest?.tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        agent: t.agent,
        dimension: t.dimension,
        steps: t.steps,
        requiresReview: t.requiresReview,
        peerReview: t.peerReview,
      })),
    };
  });
}

/** Flatten a pack's tasks into snake_case rows for Supabase persistence. */
export function packToDefinitionRows(
  packId: string,
  pack: TrainingTaskPackInput
): Array<Record<string, unknown>> {
  return pack.tasks.map((task) => ({
    id: packTaskId(pack.key, task.id),
    pack_id: packId,
    title: task.title,
    description: task.description,
    agent: task.agent,
    dimension: task.dimension,
    steps: task.steps,
    requires_review: task.requiresReview,
    peer_review: task.peerReview ?? false,
  }));
}

/** SHA-256 hex digest of text, using WebCrypto or a Node `crypto` fallback. */
export async function simpleContentHash(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text).digest("hex");
}
