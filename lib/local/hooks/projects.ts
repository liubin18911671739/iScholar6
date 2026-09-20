/**
 * Project Hooks (lib/local/hooks/projects.ts)
 *
 * Functionality:
 * - Lists and reads projects from Dexie `projects` / Supabase `projects`, coercing results to arrays.
 * - Creates, updates, archives, and hard-deletes projects with remote/local branching.
 * - Falls back to local project rows in collaborative mode when remote errors or lags.
 *
 * Notes:
 * - Collaborative creates require an authenticated user; local hard-delete cascades across all project tables.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalProject, type ProjectMetadata } from "../db";
import { nanoid } from "nanoid";
import { now } from "./utils";
import { getCollaborativeClient, isCollaborativeMode, requireCollaborativeUser } from "@/lib/supabase/collaborative";
import {
  asRowArray,
  asRowArrayOrEmpty,
  useRemoteRows,
  type RemoteListQuery,
} from "@/lib/supabase/remote-query";

/**
 * Always returns `data` as `LocalProject[] | undefined` (never a bare object).
 * Callers can safely use `data?.filter` / `Array.isArray` checks.
 */
export function useLocalProjects(): RemoteListQuery<LocalProject> {
  const remoteProjects = useRemoteRows<LocalProject>("projects");
  const localProjects = useLiveQuery(
    () => localDB.projects.orderBy("updatedAt").reverse().toArray(),
    []
  );

  return useMemo((): RemoteListQuery<LocalProject> => {
    // Dexie live query: undefined while first resolving; otherwise must be an array.
    const localList = asRowArray<LocalProject>(localProjects);
    const remoteList = asRowArray<LocalProject>(remoteProjects.data);
    const refetch = remoteProjects.refetch;

    if (!isCollaborativeMode()) {
      return { data: localList, error: null, refetch: () => {} };
    }

    // Collaborative: prefer remote when healthy; surface local rows on error/empty
    // so coach/training UIs still get a projectId when remote lags.
    if (remoteProjects.error) {
      return {
        data: localList ?? [],
        error: remoteProjects.error,
        refetch,
      };
    }
    if (remoteList === undefined) {
      if (localList && localList.length > 0) {
        return { data: localList, error: null, refetch };
      }
      return { data: undefined, error: null, refetch };
    }
    if (remoteList.length === 0 && localList && localList.length > 0) {
      return { data: localList, error: null, refetch };
    }
    // Final coercion — never leak non-arrays to UI (fixes projects.filter crashes).
    return { data: asRowArrayOrEmpty<LocalProject>(remoteList), error: null, refetch };
  }, [
    localProjects,
    remoteProjects.data,
    remoteProjects.error,
    remoteProjects.refetch,
  ]);
}

/** Reads a single project by id, remote-first in collaborative mode. */
export function useLocalProject(id: string): { data: LocalProject | undefined; error: string | null; refetch: () => void } {
  const remoteProjects = useRemoteRows<LocalProject>("projects", "id", id);
  const localProject = useLiveQuery(
    () => localDB.projects.get(id),
    [id]
  );
  if (isCollaborativeMode()) {
    return {
      data: remoteProjects.data?.[0],
      error: remoteProjects.error,
      refetch: remoteProjects.refetch,
    };
  }
  return { data: localProject, error: null, refetch: () => {} };
}

/** Creates a draft project and returns its new id. */
export async function createProject(data: {
  name: string;
  discipline?: string;
  goal?: string;
  metadata?: ProjectMetadata;
}) {
  const id = nanoid();
  const ts = now();
  const project: LocalProject = {
    id,
    name: data.name,
    discipline: data.discipline,
    goal: data.goal,
    metadata: data.metadata,
    status: "draft",
    createdAt: ts,
    updatedAt: ts,
  };

  // Collaborative mode: remote is source of truth (avoid dual-write via Dexie hooks).
  if (isCollaborativeMode()) {
    const remote = await requireCollaborativeUser();
    if (!remote) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { error } = await remote.client.from("projects").insert({
      id,
      owner_id: remote.user.id,
      name: data.name,
      discipline: data.discipline,
      goal: data.goal,
      metadata: data.metadata,
      status: "draft",
      created_at: ts,
      updated_at: ts,
    });
    if (error) throw error;
    return id;
  }

  await localDB.projects.add(project);
  return id;
}

/** Patches allowed project fields and refreshes updatedAt. */
export async function updateProject(id: string, data: Partial<LocalProject>) {
  const updatedAt = now();
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { error } = await client.from("projects").update({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.discipline !== undefined ? { discipline: data.discipline } : {}),
      ...(data.goal !== undefined ? { goal: data.goal } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      updated_at: updatedAt,
    }).eq("id", id);
    if (error) throw error;
    return;
  }
  await localDB.projects.update(id, { ...data, updatedAt } as Partial<LocalProject>);
}

/** Soft-deletes a project by marking it archived. */
export async function deleteProject(id: string) {
  await updateProject(id, { status: "archived" });
}

/**
 * Hard-deletes a project and ALL related data across all tables.
 * Local mode uses a single IndexedDB transaction; collaborative mode
 * deletes the remote project and relies on ON DELETE CASCADE.
 */
export async function hardDeleteProject(id: string) {
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { error } = await client.from("projects").delete().eq("id", id);
    if (error) throw error;
    // Best-effort local cache cleanup if residual rows exist.
    try {
      await localDB.projects.delete(id);
    } catch {
      // ignore cache cleanup failures
    }
    return;
  }

  // Local mode: delete children first inside one transaction so nothing is orphaned.
  await localDB.transaction("rw", localDB.tables, async () => {
    const submissions = await localDB.submissions.where("projectId").equals(id).toArray();
    for (const sub of submissions) {
      const rounds = await localDB.reviewRounds.where("submissionId").equals(sub.id).toArray();
      for (const round of rounds) {
        await localDB.rebuttalItems.where("reviewRoundId").equals(round.id).delete();
      }
      await localDB.reviewRounds.where("submissionId").equals(sub.id).delete();
    }

    const manuscripts = await localDB.manuscripts.where("projectId").equals(id).toArray();
    for (const ms of manuscripts) {
      await localDB.manuscriptBlocks.where("manuscriptId").equals(ms.id).delete();
      await localDB.manuscriptVersions.where("manuscriptId").equals(ms.id).delete();
    }

    const bibItems = await localDB.bibItems.where("projectId").equals(id).toArray();
    for (const bib of bibItems) {
      await localDB.ragChunks.where("bibItemId").equals(bib.id).delete();
    }

    await localDB.manuscripts.where("projectId").equals(id).delete();
    await localDB.submissions.where("projectId").equals(id).delete();
    await localDB.bibItems.where("projectId").equals(id).delete();
    await localDB.attachments.where("projectId").equals(id).delete();
    await localDB.experiments.where("projectId").equals(id).delete();
    await localDB.agentRuns.where("projectId").equals(id).delete();
    await localDB.auditLedger.where("projectId").equals(id).delete();
    await localDB.tasks.where("projectId").equals(id).delete();

    await localDB.projects.delete(id);
  });
}
