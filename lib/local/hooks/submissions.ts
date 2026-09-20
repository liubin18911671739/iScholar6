/**
 * Submission Hooks (lib/local/hooks/submissions.ts)
 *
 * Functionality:
 * - Lists manuscript submissions for a project from Dexie `submissions` / Supabase `submissions`.
 * - Creates submissions in `draft` status linking a manuscript to a target journal.
 * - Updates and deletes submissions with remote/local branching.
 *
 * Notes:
 * - Submissions own review rounds, which in turn own rebuttal items.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalSubmission } from "../db";
import { nanoid } from "nanoid";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists submissions belonging to a project. */
export function useLocalSubmissions(projectId: string): RemoteListQuery<LocalSubmission> {
  const remote = useRemoteRows<LocalSubmission>("submissions", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.submissions.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a draft submission and returns its new id. */
export async function createSubmission(data: { projectId: string; manuscriptId: string; journalName: string; coverLetter?: string }) {
  const id = nanoid();
  const submission = {
    id,
    projectId: data.projectId,
    manuscriptId: data.manuscriptId,
    journalName: data.journalName,
    coverLetter: data.coverLetter,
    status: "draft",
  };
  if (isCollaborativeMode()) await remoteInsert("submissions", submission);
  else await localDB.submissions.add(submission);
  return id;
}

/** Patches a submission by id. */
export async function updateSubmission(id: string, data: Partial<LocalSubmission>) {
  if (isCollaborativeMode()) await remoteUpdate("submissions", id, data);
  else await localDB.submissions.update(id, data as Partial<LocalSubmission>);
}

/** Deletes a submission by id. */
export async function deleteSubmission(id: string) {
  if (isCollaborativeMode()) await remoteDelete("submissions", id);
  else await localDB.submissions.delete(id);
}
