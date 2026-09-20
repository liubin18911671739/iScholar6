/**
 * Review Round Hooks (lib/local/hooks/review-rounds.ts)
 *
 * Functionality:
 * - Lists review rounds for a submission from Dexie `reviewRounds` / Supabase `review_rounds`.
 * - Creates rounds recording round number, editor decision, and review text.
 * - Updates and deletes rounds with remote/local branching.
 *
 * Notes:
 * - Each round parents a set of rebuttal items.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalReviewRound } from "../db";
import { nanoid } from "nanoid";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists review rounds belonging to a submission. */
export function useLocalReviewRounds(submissionId: string): RemoteListQuery<LocalReviewRound> {
  const remote = useRemoteRows<LocalReviewRound>("review_rounds", "submission_id", submissionId);
  const local = useLiveQuery(
    () => localDB.reviewRounds.where("submissionId").equals(submissionId).toArray(),
    [submissionId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a review round and returns its new id. */
export async function createReviewRound(data: { submissionId: string; roundNumber: number; decision?: string; reviewText?: string }) {
  const id = nanoid();
  const round = {
    id,
    submissionId: data.submissionId,
    roundNumber: data.roundNumber,
    decision: data.decision,
    reviewText: data.reviewText,
  };
  if (isCollaborativeMode()) await remoteInsert("review_rounds", round);
  else await localDB.reviewRounds.add(round);
  return id;
}

/** Patches a review round by id. */
export async function updateReviewRound(id: string, data: Partial<LocalReviewRound>) {
  if (isCollaborativeMode()) await remoteUpdate("review_rounds", id, data);
  else await localDB.reviewRounds.update(id, data as Partial<LocalReviewRound>);
}

/** Deletes a review round by id. */
export async function deleteReviewRound(id: string) {
  if (isCollaborativeMode()) await remoteDelete("review_rounds", id);
  else await localDB.reviewRounds.delete(id);
}
