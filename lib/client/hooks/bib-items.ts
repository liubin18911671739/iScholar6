/**
 * Backend bibliography hooks (lib/client/hooks/bib-items.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for bibliography items via the BFF.
 * - Supports single and bulk creation.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { BibItemMetadata, LocalBibItem } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

type BibItemInput = {
  projectId: string;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  keywords?: string[];
  citationCount?: number;
  metadata?: BibItemMetadata;
};

/** Lists a project's bibliography items. */
export function useLocalBibItems(projectId: string): RemoteListQuery<LocalBibItem> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.bibItems(projectId),
    queryFn: () => api.listBibItems(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a bibliography item and returns its id. */
export async function createBibItem(data: BibItemInput): Promise<string> {
  const item = await api.createBibItem(data);
  await getQueryClient().invalidateQueries({ queryKey: ["bib-items"] });
  return item.id;
}

/** Patches a bibliography item. */
export async function updateBibItem(id: string, data: Partial<LocalBibItem>): Promise<void> {
  await api.patchBibItem(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["bib-items"] });
}

/** Deletes a bibliography item. */
export async function deleteBibItem(id: string): Promise<void> {
  await api.removeBibItem(id);
  await getQueryClient().invalidateQueries({ queryKey: ["bib-items"] });
}

/** Bulk-inserts many bibliography items. */
export async function bulkCreateBibItems(items: BibItemInput[]): Promise<void> {
  await api.bulkCreateBibItems(items);
  await getQueryClient().invalidateQueries({ queryKey: ["bib-items"] });
}
