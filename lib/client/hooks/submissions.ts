/**
 * Backend submission hooks (lib/client/hooks/submissions.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for journal submissions via the BFF.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalSubmission } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a project's submissions. */
export function useLocalSubmissions(projectId: string): RemoteListQuery<LocalSubmission> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.submissions(projectId),
    queryFn: () => api.listSubmissions(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a submission and returns its id. */
export async function createSubmission(data: {
  projectId: string;
  manuscriptId: string;
  journalName: string;
  coverLetter?: string;
}): Promise<string> {
  const submission = await api.createSubmission(data);
  await getQueryClient().invalidateQueries({ queryKey: ["submissions"] });
  return submission.id;
}

/** Patches a submission. */
export async function updateSubmission(id: string, data: Partial<LocalSubmission>): Promise<void> {
  await api.patchSubmission(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["submissions"] });
}

/** Deletes a submission. */
export async function deleteSubmission(id: string): Promise<void> {
  await api.removeSubmission(id);
  await getQueryClient().invalidateQueries({ queryKey: ["submissions"] });
}
