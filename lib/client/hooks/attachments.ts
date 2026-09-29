/**
 * Backend attachment + RAG chunk hooks (lib/client/hooks/attachments.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for project attachments and bibliography RAG chunks.
 * - Attachment blobs are uploaded multipart; downloads use the signed BFF URL.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalAttachment, LocalRagChunk } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a project's attachment metadata. */
export function useLocalAttachments(projectId: string): RemoteListQuery<LocalAttachment> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.attachments(projectId),
    queryFn: () => api.listAttachments(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Lists vector RAG chunks associated with a bibliography item. */
export function useLocalRagChunks(bibItemId: string): RemoteListQuery<LocalRagChunk> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.ragChunks(bibItemId),
    queryFn: () => api.listRagChunks(bibItemId),
    enabled: Boolean(bibItemId),
  });
  return toListQuery(data, error, refetch);
}

/** Uploads an attachment blob and returns its id. */
export async function createAttachment(data: {
  projectId: string;
  bibItemId?: string;
  filename: string;
  data: Blob;
  mimeType?: string;
}): Promise<string> {
  const attachment = await api.createAttachment(data);
  await getQueryClient().invalidateQueries({ queryKey: ["attachments"] });
  return attachment.id;
}

/** Patches attachment metadata. */
export async function updateAttachment(id: string, data: Partial<LocalAttachment>): Promise<void> {
  await api.patchAttachment(id, { filename: data.filename, bibItemId: data.bibItemId });
  await getQueryClient().invalidateQueries({ queryKey: ["attachments"] });
}

/** Deletes an attachment and its blob. */
export async function deleteAttachment(id: string): Promise<void> {
  await api.removeAttachment(id);
  await getQueryClient().invalidateQueries({ queryKey: ["attachments"] });
}
