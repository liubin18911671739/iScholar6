/**
 * Backend experiment hooks (lib/client/hooks/experiments.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks for experiments via the BFF.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { ExperimentParams, LocalExperiment } from "@/lib/local/db";
import type { RemoteListQuery } from "@/lib/supabase/remote-query";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { toListQuery } from "./shared";

/** Lists a project's experiments, newest first. */
export function useLocalExperiments(projectId: string): RemoteListQuery<LocalExperiment> {
  const { data, error, refetch } = useQuery({
    queryKey: qk.experiments(projectId),
    queryFn: () => api.listExperiments(projectId),
    enabled: Boolean(projectId),
  });
  return toListQuery(data, error, refetch);
}

/** Creates an experiment and returns its id. */
export async function createExperiment(data: {
  projectId: string;
  name: string;
  dataset?: string;
  params?: ExperimentParams;
}): Promise<string> {
  const experiment = await api.createExperiment(data);
  await getQueryClient().invalidateQueries({ queryKey: ["experiments"] });
  return experiment.id;
}

/** Patches an experiment. */
export async function updateExperiment(id: string, data: Partial<LocalExperiment>): Promise<void> {
  await api.patchExperiment(id, data);
  await getQueryClient().invalidateQueries({ queryKey: ["experiments"] });
}

/** Deletes an experiment. */
export async function deleteExperiment(id: string): Promise<void> {
  await api.removeExperiment(id);
  await getQueryClient().invalidateQueries({ queryKey: ["experiments"] });
}
