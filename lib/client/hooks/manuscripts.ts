/**
 * Backend manuscript hooks (lib/client/hooks/manuscripts.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for manuscripts and manuscript blocks via the BFF.
 * - Version snapshots and content hashing are owned by the backend, not the client.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalManuscript, LocalManuscriptBlock } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a project's manuscripts. */
export function useLocalManuscripts(projectId: string): RemoteListQuery<LocalManuscript> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.manuscripts(projectId),
    queryFn: () => api.listManuscripts(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Lists a manuscript's blocks ordered by ordinal. */
export function useLocalManuscriptBlocks(manuscriptId: string): RemoteListQuery<LocalManuscriptBlock> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.blocks(manuscriptId),
    queryFn: () => api.listBlocks(manuscriptId),
    enabled: Boolean(manuscriptId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a manuscript and returns its id. */
export async function createManuscript(data: {
  projectId: string;
  title: string;
  abstract?: string;
  targetJournal?: string;
}): Promise<string> {
  const manuscript = await api.createManuscript(data);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscripts"] });
  return manuscript.id;
}

/** Patches a manuscript. */
export async function updateManuscript(id: string, data: Partial<LocalManuscript>): Promise<void> {
  await api.patchManuscript(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscripts"] });
}

/** Creates a block (backend writes its version-1 snapshot) and returns its id. */
export async function createManuscriptBlock(data: {
  manuscriptId: string;
  section: string;
  order: number;
  content: string;
}): Promise<string> {
  const block = await api.createBlock(data);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-blocks"] });
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-versions"] });
  return block.id;
}

/** Patches a block; content changes create a new snapshot server-side. */
export async function updateManuscriptBlock(
  id: string,
  data: Partial<LocalManuscriptBlock>
): Promise<void> {
  await api.patchBlock(id, {
    section: data.section,
    order: data.order,
    content: data.content,
    version: data.version,
    authorType: data.authorType,
  });
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-blocks"] });
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-versions"] });
}

/** Deletes a block by id. */
export async function deleteManuscriptBlock(id: string): Promise<void> {
  await api.removeBlock(id);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-blocks"] });
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-versions"] });
}

/** Persists a new block ordering. */
export async function reorderManuscriptBlocks(
  manuscriptId: string,
  orderedIds: string[]
): Promise<void> {
  await api.reorderBlocks(manuscriptId, orderedIds);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-blocks"] });
}
