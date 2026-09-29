/**
 * Backend project hooks (lib/client/hooks/projects.ts)
 *
 * Functionality:
 * - React Query read/mutation hooks backed by the `/api/data/projects` BFF routes.
 * - Mirrors the legacy `lib/local/hooks/projects` public signatures.
 *
 * @author mrpi
 * @date 2026-09-27
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LocalProject, ProjectMetadata } from "@/lib/types/domain";
import type { RemoteListQuery } from "@/lib/client/types";
import * as api from "@/lib/client/data";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { errorMessage, toListQuery } from "./shared";

/** Lists the caller's projects, newest first. */
export function useLocalProjects(): RemoteListQuery<LocalProject> {
  const { data, error, refetch } = useQuery({ queryKey: qk.projects, queryFn: api.listProjects });
  return toListQuery(data, error, refetch);
}

/** Reads a single project by id. */
export function useLocalProject(id: string): {
  data: LocalProject | undefined;
  error: string | null;
  refetch: () => void;
} {
  const { data, error, refetch } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => api.getProject(id),
    enabled: Boolean(id),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Creates a project and returns its id. */
export async function createProject(data: {
  name: string;
  discipline?: string;
  goal?: string;
  metadata?: ProjectMetadata;
}): Promise<string> {
  const project = await api.createProject(data);
  await getQueryClient().invalidateQueries({ queryKey: qk.projects });
  return project.id;
}

/** Patches allowed project fields. */
export async function updateProject(id: string, data: Partial<LocalProject>): Promise<void> {
  await api.patchProject(id, data);
  await getQueryClient().invalidateQueries({ queryKey: qk.projects });
}

/** Soft-deletes a project by archiving it. */
export async function deleteProject(id: string): Promise<void> {
  await updateProject(id, { status: "archived" });
}

/** Hard-deletes a project; Postgres cascades to child rows. */
export async function hardDeleteProject(id: string): Promise<void> {
  await api.removeProject(id);
  await getQueryClient().invalidateQueries({ queryKey: qk.projects });
}
