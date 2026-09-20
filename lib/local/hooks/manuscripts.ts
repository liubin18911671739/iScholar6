/**
 * Manuscript Hooks (lib/local/hooks/manuscripts.ts)
 *
 * Functionality:
 * - Lists manuscripts per project and manuscript blocks per manuscript from Dexie or Supabase.
 * - Creates/updates/deletes manuscripts and blocks, auto-snapshotting a hashed content version on block edits.
 * - Reorders blocks by writing sequential `order` values.
 *
 * Notes:
 * - Local mode writes `manuscripts`, `manuscriptBlocks`, and `manuscriptVersions`; content hashes come from the audit ledger.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalManuscript, type LocalManuscriptBlock } from "../db";
import { hashContent } from "@/lib/audit/ledger";
import { nanoid } from "nanoid";
import { now, resolveListQuery } from "./utils";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { fromRemoteRecord } from "@/lib/supabase/field-map";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";

/** Lists manuscripts belonging to a project. */
export function useLocalManuscripts(projectId: string): RemoteListQuery<LocalManuscript> {
  const remote = useRemoteRows<LocalManuscript>("manuscripts", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.manuscripts.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Lists a manuscript's blocks ordered by their `order` field. */
export function useLocalManuscriptBlocks(manuscriptId: string): RemoteListQuery<LocalManuscriptBlock> {
  const remote = useRemoteRows<LocalManuscriptBlock>("manuscript_blocks", "manuscript_id", manuscriptId);
  const local = useLiveQuery(
    () => localDB.manuscriptBlocks.where("manuscriptId").equals(manuscriptId).sortBy("order"),
    [manuscriptId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a draft manuscript at version 1 and returns its new id. */
export async function createManuscript(data: { projectId: string; title: string; abstract?: string; targetJournal?: string }) {
  const id = nanoid();
  const ts = now();
  const manuscript = {
    id,
    projectId: data.projectId,
    title: data.title,
    abstract: data.abstract,
    targetJournal: data.targetJournal,
    currentVersion: 1,
    status: "draft",
    updatedAt: ts,
  };
  if (isCollaborativeMode()) {
    await remoteInsert("manuscripts", manuscript);
  } else await localDB.manuscripts.add(manuscript);
  return id;
}

/** Patches a manuscript and refreshes its updatedAt timestamp. */
export async function updateManuscript(id: string, data: Partial<LocalManuscript>) {
  const updatedAt = now();
  if (isCollaborativeMode()) {
    await remoteUpdate("manuscripts", id, { ...data, updatedAt });
  } else await localDB.manuscripts.update(id, { ...data, updatedAt } as Partial<LocalManuscript>);
}

/** Creates a block plus its initial hashed version-1 snapshot. */
export async function createManuscriptBlock(data: { manuscriptId: string; section: string; order: number; content: string }) {
  const id = nanoid();
  const block = {
    id,
    manuscriptId: data.manuscriptId,
    section: data.section,
    order: data.order,
    content: data.content,
    version: 1,
    authorType: "human",
    updatedAt: now(),
  };

  const contentHash = await hashContent(data.content);
  const version = {
    id: nanoid(),
    manuscriptId: data.manuscriptId,
    blockId: id,
    version: 1,
    content: data.content,
    authorType: "human",
    createdAt: now(),
    contentHash,
  };

  if (isCollaborativeMode()) {
    await remoteInsert("manuscript_blocks", block);
    await remoteInsert("manuscript_versions", version);
  } else {
    await localDB.manuscriptBlocks.add(block);
    await localDB.manuscriptVersions.add(version);
  }

  return id;
}

// Fetches a single block from Supabase (collaborative) or Dexie for version checks.
async function getManuscriptBlock(id: string): Promise<LocalManuscriptBlock | undefined> {
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) return undefined;
    const { data, error } = await client.from("manuscript_blocks").select("*").eq("id", id).maybeSingle();
    if (error) {
      console.error("Supabase manuscript_blocks get failed", error);
      return undefined;
    }
    return data
      ? (fromRemoteRecord(data as Record<string, unknown>) as unknown as LocalManuscriptBlock)
      : undefined;
  }
  return localDB.manuscriptBlocks.get(id);
}

/** Updates a block, writing a new hashed version snapshot when content changed. */
export async function updateManuscriptBlock(id: string, data: Partial<LocalManuscriptBlock>) {
  if (data.content !== undefined) {
    const existing = await getManuscriptBlock(id);
    if (existing && existing.content !== data.content) {
      const contentHash = await hashContent(data.content);
      // Bump the block version so the new snapshot has a distinct version number.
      const currentVersion = existing.version ?? 1;
      const version = {
        id: nanoid(),
        manuscriptId: existing.manuscriptId,
        blockId: id,
        version: currentVersion + 1,
        content: data.content,
        authorType: data.authorType ?? "human",
        agentRunId: data.agentRunId,
        createdAt: now(),
        contentHash,
      };
      const update = {
        ...data,
        version: currentVersion + 1,
        updatedAt: now(),
      };
      if (isCollaborativeMode()) {
        await remoteInsert("manuscript_versions", version);
        await remoteUpdate("manuscript_blocks", id, update);
      } else {
        await localDB.manuscriptVersions.add(version);
        await localDB.manuscriptBlocks.update(id, update as Partial<LocalManuscriptBlock>);
      }
      return;
    }
  }
  const update = { ...data, updatedAt: now() };
  if (isCollaborativeMode()) await remoteUpdate("manuscript_blocks", id, update);
  else await localDB.manuscriptBlocks.update(id, update as Partial<LocalManuscriptBlock>);
}

/** Deletes a manuscript block by id. */
export async function deleteManuscriptBlock(id: string) {
  if (isCollaborativeMode()) await remoteDelete("manuscript_blocks", id);
  else await localDB.manuscriptBlocks.delete(id);
}

/** Persists a new block ordering by rewriting each block's `order` index. */
export async function reorderManuscriptBlocks(manuscriptId: string, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const update = { order: i, updatedAt: now() };
    if (isCollaborativeMode()) await remoteUpdate("manuscript_blocks", orderedIds[i], update);
    else await localDB.manuscriptBlocks.update(orderedIds[i], update);
  }
}
