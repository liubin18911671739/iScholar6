/**
 * Attachment & RAG Chunk Hooks (lib/local/hooks/attachments.ts)
 *
 * Functionality:
 * - Lists project attachments and per-bibliography RAG chunks from Dexie or Supabase.
 * - Creates attachments by uploading blobs to Supabase Storage (collaborative) or storing them in Dexie.
 * - Updates and deletes attachments with remote/local branching.
 *
 * Notes:
 * - Collaborative uploads write to the `attachments` storage bucket and the `attachments` table.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalAttachment } from "../db";
import { nanoid } from "nanoid";
import { now, resolveListQuery } from "./utils";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";

/** Lists attachments belonging to a project. */
export function useLocalAttachments(projectId: string): RemoteListQuery<LocalAttachment> {
  const remote = useRemoteRows<LocalAttachment>("attachments", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.attachments.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Lists vector RAG chunks associated with a bibliography item. */
export function useLocalRagChunks(bibItemId: string): RemoteListQuery<Record<string, unknown>> {
  const remote = useRemoteRows<Record<string, unknown>>("rag_chunks", "bib_item_id", bibItemId);
  const local = useLiveQuery(
    () => localDB.ragChunks.where("bibItemId").equals(bibItemId).toArray(),
    [bibItemId]
  );
  return resolveListQuery(remote, local as Record<string, unknown>[] | undefined);
}

/** Stores an attachment blob remotely or locally and returns its new id. */
export async function createAttachment(data: { projectId: string; bibItemId?: string; filename: string; data: Blob; mimeType?: string }) {
  const id = nanoid();
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const path = `${data.projectId}/${id}-${data.filename}`;
    const upload = await client.storage.from("attachments").upload(path, data.data, { contentType: data.mimeType, upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await client.from("attachments").insert({ id, project_id: data.projectId, bib_item_id: data.bibItemId, filename: data.filename, storage_path: path, mime_type: data.mimeType, size_bytes: data.data.size, encrypted: false, created_at: now() });
    if (error) throw error;
  } else await localDB.attachments.add({
    id, projectId: data.projectId, bibItemId: data.bibItemId, filename: data.filename, data: data.data,
    mimeType: data.mimeType, sizeBytes: data.data.size, encrypted: false, createdAt: now(),
  });
  return id;
}

/** Patches an existing attachment in remote or local storage. */
export async function updateAttachment(id: string, data: Partial<LocalAttachment>) {
  if (isCollaborativeMode()) await remoteUpdate("attachments", id, data);
  else await localDB.attachments.update(id, data as Partial<LocalAttachment>);
}

/** Removes an attachment from remote or local storage. */
export async function deleteAttachment(id: string) {
  if (isCollaborativeMode()) await remoteDelete("attachments", id);
  else await localDB.attachments.delete(id);
}
