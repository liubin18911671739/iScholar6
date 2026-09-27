/**
 * Backend version hooks (lib/client/hooks/versions.ts)
 *
 * Functionality:
 * - React Query hooks listing a manuscript's or block's version history.
 * - `rollbackToVersion` restores a block through the BFF; the block id is passed by the
 *   caller, falling back to a React Query cache lookup for legacy call sites.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalManuscriptVersion } from "@/lib/local/db";
import type { RemoteListQuery } from "@/lib/supabase/remote-query";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a manuscript's versions, newest first. */
export function useManuscriptVersions(manuscriptId: string): RemoteListQuery<LocalManuscriptVersion> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.versionsByManuscript(manuscriptId),
    queryFn: () => api.listVersions({ manuscriptId }),
    enabled: Boolean(manuscriptId),
  });
  return toListQuery(data, error, refetch);
}

/** Lists a block's versions, newest first. */
export function useBlockVersions(blockId: string): RemoteListQuery<LocalManuscriptVersion> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.versionsByBlock(blockId),
    queryFn: () => api.listVersions({ blockId }),
    enabled: Boolean(blockId),
  });
  return toListQuery(data, error, refetch);
}

/** Find a cached version's block id when the caller did not supply one. */
function findCachedBlockId(versionId: string): string | undefined {
  const cached = getQueryClient().getQueryCache().findAll({ queryKey: ["manuscript-versions"] });
  for (const query of cached) {
    const rows = query.state.data as LocalManuscriptVersion[] | undefined;
    const match = rows?.find((row) => row.id === versionId);
    if (match?.blockId) return match.blockId;
  }
  return undefined;
}

/** Restores a block to the given version's content; returns the block id or null. */
export async function rollbackToVersion(versionId: string, blockId?: string): Promise<string | null> {
  const targetBlockId = blockId ?? findCachedBlockId(versionId);
  if (!targetBlockId) return null;
  await api.rollbackBlock(targetBlockId, versionId);
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-blocks"] });
  await getQueryClient().invalidateQueries({ queryKey: ["manuscript-versions"] });
  return targetBlockId;
}
