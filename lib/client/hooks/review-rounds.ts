/**
 * Backend review-round hooks (lib/client/hooks/review-rounds.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for submission review rounds via the BFF.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalReviewRound } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a submission's review rounds. */
export function useLocalReviewRounds(submissionId: string): RemoteListQuery<LocalReviewRound> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.reviewRounds(submissionId),
    queryFn: () => api.listReviewRounds(submissionId),
    enabled: Boolean(submissionId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a review round and returns its id. */
export async function createReviewRound(data: {
  submissionId: string;
  roundNumber: number;
  decision?: string;
  reviewText?: string;
}): Promise<string> {
  const round = await api.createReviewRound(data);
  await getQueryClient().invalidateQueries({ queryKey: ["review-rounds"] });
  return round.id;
}

/** Patches a review round. */
export async function updateReviewRound(id: string, data: Partial<LocalReviewRound>): Promise<void> {
  await api.patchReviewRound(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["review-rounds"] });
}

/** Deletes a review round. */
export async function deleteReviewRound(id: string): Promise<void> {
  await api.removeReviewRound(id);
  await getQueryClient().invalidateQueries({ queryKey: ["review-rounds"] });
}
