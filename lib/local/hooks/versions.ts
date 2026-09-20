/**
 * Manuscript Version Hooks (lib/local/hooks/versions.ts)
 *
 * Functionality:
 * - Lists content versions per manuscript or per block, newest first.
 * - Exposes `rollbackToVersion` to restore a block to a prior snapshot.
 * - Reads Dexie `manuscriptVersions` or Supabase `manuscript_versions`.
 *
 * Notes:
 * - Rollback rewrites the target block content and marks it human-authored.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalManuscriptVersion } from "../db";
import { now, resolveListQuery } from "./utils";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { useRemoteRows, remoteUpdate, type RemoteListQuery } from "@/lib/supabase/remote-query";

/** Lists a manuscript's versions, newest first. */
export function useManuscriptVersions(manuscriptId: string): RemoteListQuery<LocalManuscriptVersion> {
  const remote = useRemoteRows<LocalManuscriptVersion>("manuscript_versions", "manuscript_id", manuscriptId);
  const local = useLiveQuery(
    () => localDB.manuscriptVersions
      .where("manuscriptId")
      .equals(manuscriptId)
      .reverse()
      .sortBy("version"),
    [manuscriptId]
  );
  return resolveListQuery(remote, local);
}

/** Lists a block's versions, newest first. */
export function useBlockVersions(blockId: string): RemoteListQuery<LocalManuscriptVersion> {
  const remote = useRemoteRows<LocalManuscriptVersion>("manuscript_versions", "block_id", blockId);
  const local = useLiveQuery(
    () => localDB.manuscriptVersions
      .where("blockId")
      .equals(blockId)
      .reverse()
      .sortBy("version"),
    [blockId]
  );
  return resolveListQuery(remote, local);
}

/** Restores a block to the given version's content; returns the block id or null. */
export async function rollbackToVersion(versionId: string): Promise<string | null> {
  let version: LocalManuscriptVersion | undefined;
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    const { data } = client ? await client.from("manuscript_versions").select("*").eq("id", versionId).maybeSingle() : { data: null };
    version = data ? { ...data, manuscriptId: data.manuscript_id, blockId: data.block_id, authorType: data.author_type, agentRunId: data.agent_run_id, createdAt: data.created_at, contentHash: data.content_hash } : undefined;
  } else version = await localDB.manuscriptVersions.get(versionId);
  if (!version || !version.blockId) return null;

  const patch = {
    content: version.content,
    version: version.version,
    authorType: "human",
    updatedAt: now(),
  };
  if (isCollaborativeMode()) await remoteUpdate("manuscript_blocks", version.blockId, patch);
  else await localDB.manuscriptBlocks.update(version.blockId, patch);

  return version.blockId;
}
