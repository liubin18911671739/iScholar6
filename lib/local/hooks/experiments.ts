/**
 * Experiment Hooks (lib/local/hooks/experiments.ts)
 *
 * Functionality:
 * - Lists experiments for a project from Dexie `experiments` / Supabase `experiments`, newest first.
 * - Creates experiments with optional dataset and parameter payloads.
 * - Updates and deletes experiments with remote/local branching.
 *
 * Notes:
 * - Mirrors the CRUD shape shared by the other simple entity hooks.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalExperiment, type ExperimentParams } from "../db";
import { nanoid } from "nanoid";
import { now, resolveListQuery } from "./utils";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";

/** Lists a project's experiments newest-first. */
export function useLocalExperiments(projectId: string): RemoteListQuery<LocalExperiment> {
  const remote = useRemoteRows<LocalExperiment>("experiments", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.experiments.where("projectId").equals(projectId).reverse().sortBy("createdAt"),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Creates an experiment and returns its new id. */
export async function createExperiment(data: { projectId: string; name: string; dataset?: string; params?: ExperimentParams }) {
  const id = nanoid();
  const experiment = {
    id,
    projectId: data.projectId,
    name: data.name,
    dataset: data.dataset,
    params: data.params,
    createdAt: now(),
  };
  if (isCollaborativeMode()) await remoteInsert("experiments", experiment);
  else await localDB.experiments.add(experiment);
  return id;
}

/** Patches an experiment by id. */
export async function updateExperiment(id: string, data: Partial<LocalExperiment>) {
  if (isCollaborativeMode()) await remoteUpdate("experiments", id, data);
  else await localDB.experiments.update(id, data as Partial<LocalExperiment>);
}

/** Deletes an experiment by id. */
export async function deleteExperiment(id: string) {
  if (isCollaborativeMode()) await remoteDelete("experiments", id);
  else await localDB.experiments.delete(id);
}
