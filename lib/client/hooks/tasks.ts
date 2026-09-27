/**
 * Backend task hooks (lib/client/hooks/tasks.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for project tasks via the BFF.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalTask } from "@/lib/local/db";
import type { RemoteListQuery } from "@/lib/supabase/remote-query";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a project's tasks. */
export function useLocalTasks(projectId: string): RemoteListQuery<LocalTask> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.tasks(projectId),
    queryFn: () => api.listTasks(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates a pending task and returns its id. */
export async function createTask(data: {
  projectId: string;
  title: string;
  description?: string;
}): Promise<string> {
  const task = await api.createTask(data);
  await getQueryClient().invalidateQueries({ queryKey: ["tasks"] });
  return task.id;
}

/** Patches a task. */
export async function updateTask(id: string, data: Partial<LocalTask>): Promise<void> {
  await api.patchTask(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["tasks"] });
}

/** Deletes a task. */
export async function deleteTask(id: string): Promise<void> {
  await api.removeTask(id);
  await getQueryClient().invalidateQueries({ queryKey: ["tasks"] });
}
