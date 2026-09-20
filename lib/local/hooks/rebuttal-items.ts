/**
 * Rebuttal Item Hooks (lib/local/hooks/rebuttal-items.ts)
 *
 * Functionality:
 * - Lists rebuttal items for a review round from Dexie `rebuttalItems` / Supabase `rebuttal_items`.
 * - Creates items capturing a single reviewer comment to respond to.
 * - Updates and deletes items with remote/local branching.
 *
 * Notes:
 * - Rebuttal items are scoped to a review round, which is scoped to a submission.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalRebuttalItem } from "../db";
import { nanoid } from "nanoid";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists rebuttal items belonging to a review round. */
export function useLocalRebuttalItems(reviewRoundId: string): RemoteListQuery<LocalRebuttalItem> {
  const remote = useRemoteRows<LocalRebuttalItem>("rebuttal_items", "review_round_id", reviewRoundId);
  const local = useLiveQuery(
    () => localDB.rebuttalItems.where("reviewRoundId").equals(reviewRoundId).toArray(),
    [reviewRoundId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a rebuttal item for a reviewer comment and returns its new id. */
export async function createRebuttalItem(data: { reviewRoundId: string; reviewerComment: string }) {
  const id = nanoid();
  const item = {
    id,
    reviewRoundId: data.reviewRoundId,
    reviewerComment: data.reviewerComment,
  };
  if (isCollaborativeMode()) await remoteInsert("rebuttal_items", item);
  else await localDB.rebuttalItems.add(item);
  return id;
}

/** Patches a rebuttal item by id. */
export async function updateRebuttalItem(id: string, data: Partial<LocalRebuttalItem>) {
  if (isCollaborativeMode()) await remoteUpdate("rebuttal_items", id, data);
  else await localDB.rebuttalItems.update(id, data as Partial<LocalRebuttalItem>);
}

/** Deletes a rebuttal item by id. */
export async function deleteRebuttalItem(id: string) {
  if (isCollaborativeMode()) await remoteDelete("rebuttal_items", id);
  else await localDB.rebuttalItems.delete(id);
}
