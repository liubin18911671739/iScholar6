/**
 * Backend rebuttal-item hooks (lib/client/hooks/rebuttal-items.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for rebuttal items via the BFF.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalRebuttalItem } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a review round's rebuttal items. */
export function useLocalRebuttalItems(reviewRoundId: string): RemoteListQuery<LocalRebuttalItem> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.rebuttalItems(reviewRoundId),
    queryFn: () => api.listRebuttalItems(reviewRoundId),
    enabled: Boolean(reviewRoundId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a rebuttal item and returns its id. */
export async function createRebuttalItem(data: {
  reviewRoundId: string;
  reviewerComment: string;
}): Promise<string> {
  const item = await api.createRebuttalItem(data);
  await getQueryClient().invalidateQueries({ queryKey: ["rebuttal-items"] });
  return item.id;
}

/** Patches a rebuttal item. */
export async function updateRebuttalItem(
  id: string,
  data: Partial<LocalRebuttalItem>
): Promise<void> {
  await api.patchRebuttalItem(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["rebuttal-items"] });
}

/** Deletes a rebuttal item. */
export async function deleteRebuttalItem(id: string): Promise<void> {
  await api.removeRebuttalItem(id);
  await getQueryClient().invalidateQueries({ queryKey: ["rebuttal-items"] });
}
