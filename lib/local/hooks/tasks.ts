/**
 * Task Hooks (lib/local/hooks/tasks.ts)
 *
 * Functionality:
 * - Lists project tasks from Dexie `tasks` / Supabase `tasks`.
 * - Creates tasks in `pending` status attributed to the human author.
 * - Updates and deletes tasks with remote/local branching.
 *
 * Notes:
 * - Distinct from training tasks; these are general project work items.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalTask } from "../db";
import { nanoid } from "nanoid";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { resolveListQuery } from "./utils";

/** Lists tasks belonging to a project. */
export function useLocalTasks(projectId: string): RemoteListQuery<LocalTask> {
  const remote = useRemoteRows<LocalTask>("tasks", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.tasks.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a pending task and returns its new id. */
export async function createTask(data: { projectId: string; title: string; description?: string }) {
  const id = nanoid();
  const task = {
    id,
    projectId: data.projectId,
    title: data.title,
    description: data.description,
    status: "pending",
    createdBy: "human",
  };
  if (isCollaborativeMode()) await remoteInsert("tasks", task);
  else await localDB.tasks.add(task);
  return id;
}

/** Patches a task by id. */
export async function updateTask(id: string, data: Partial<LocalTask>) {
  if (isCollaborativeMode()) await remoteUpdate("tasks", id, data);
  else await localDB.tasks.update(id, data as Partial<LocalTask>);
}

/** Deletes a task by id. */
export async function deleteTask(id: string) {
  if (isCollaborativeMode()) await remoteDelete("tasks", id);
  else await localDB.tasks.delete(id);
}
