/**
 * Training Learner Hooks (lib/local/hooks/training.ts)
 *
 * Functionality:
 * - Lists training tasks, submissions, evidence cards, and per-task report data.
 * - Creates/updates tasks, submissions, evidence cards, reviews, and AI consent records.
 * - Seeds training task definitions into IndexedDB even when remote rows are missing or blocked.
 *
 * Notes:
 * - Collaborative submissions route reviews/consents through /api routes with auth headers.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { nanoid } from "nanoid";
import {
  localDB,
  type LocalAiConsent,
  type LocalEvidenceCard,
  type LocalTrainingReview,
  type LocalTrainingSubmission,
  type LocalTrainingTask,
} from "../db";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";
import { getCollaborativeAuthHeaders, getCollaborativeClient } from "@/lib/supabase/collaborative";
import { resolveListQuery } from "./utils";

// ISO timestamp helper scoped to this module.
const now = () => new Date().toISOString();
// Last consent saved to the remote API, used to avoid a refetch within the TTL.
let latestCollaborativeConsent: LocalAiConsent | undefined;

/** Lists a project's training tasks (seeds from local rows in collaborative mode). */
export function useTrainingTasks(projectId: string): RemoteListQuery<LocalTrainingTask> {
  const remote = useRemoteRows<LocalTrainingTask>("training_tasks", "project_id", projectId);
  const local = useLiveQuery(
    () =>
      projectId
        ? localDB.trainingTasks.where("projectId").equals(projectId).sortBy("updatedAt")
        : Promise.resolve([] as LocalTrainingTask[]),
    [projectId]
  );
  // Collaborative: prefer remote when healthy; on remote error/empty hang, still surface local
  // rows so the coach UI can seed MVP tasks offline-first.
  if (isCollaborativeMode()) {
    if (remote.error) {
      return {
        data: local ?? [],
        error: remote.error,
        refetch: remote.refetch,
      };
    }
    if (remote.data === undefined) {
      // Still loading remote — show local immediately if present to avoid blank coach UI.
      if (local && local.length > 0) {
        return { data: local, error: null, refetch: remote.refetch };
      }
      return remote;
    }
    // Remote empty but local has seeded tasks → use local definitions for UI.
    if (remote.data.length === 0 && local && local.length > 0) {
      return { data: local, error: null, refetch: remote.refetch };
    }
    return remote;
  }
  return resolveListQuery(remote, local);
}

/** Lists submissions for a training task. */
export function useTrainingSubmissions(taskId: string): RemoteListQuery<LocalTrainingSubmission> {
  const remote = useRemoteRows<LocalTrainingSubmission>("training_submissions", "task_id", taskId);
  const local = useLiveQuery(
    () => localDB.trainingSubmissions.where("taskId").equals(taskId).toArray(),
    [taskId]
  );
  return resolveListQuery(remote, local);
}

/** Lists evidence cards attached to a submission. */
export function useEvidenceCards(submissionId: string): RemoteListQuery<LocalEvidenceCard> {
  const remote = useRemoteRows<LocalEvidenceCard>("evidence_cards", "submission_id", submissionId);
  const local = useLiveQuery(
    () => localDB.evidenceCards.where("submissionId").equals(submissionId).toArray(),
    [submissionId]
  );
  return resolveListQuery(remote, local);
}

/** Joins a project's training tasks with their submissions for reporting. */
export function useTrainingReportData(projectId: string) {
  const remoteTasks = useRemoteRows<LocalTrainingTask>("training_tasks", "project_id", projectId);
  const remoteSubs = useRemoteRows<LocalTrainingSubmission>("training_submissions", "project_id", projectId);
  const local = useLiveQuery(async () => {
    const tasks = await localDB.trainingTasks.where("projectId").equals(projectId).toArray();
    const submissions = await localDB.trainingSubmissions.where("projectId").equals(projectId).toArray();
    return tasks.map((task) => ({
      task,
      submission: submissions.find((item) => item.taskId === task.id),
    }));
  }, [projectId]);

  if (isCollaborativeMode()) {
    if (remoteTasks.error || remoteSubs.error) {
      return undefined;
    }
    if (remoteTasks.data === undefined || remoteSubs.data === undefined) {
      return undefined;
    }
    return remoteTasks.data.map((task) => ({
      task,
      submission: remoteSubs.data!.find((item) => item.taskId === task.id),
    }));
  }
  return local;
}

/** Creates a training task, always seeding IndexedDB and mirroring remote best-effort. */
export async function createTrainingTask(
  data: Omit<LocalTrainingTask, "id" | "createdAt" | "updatedAt" | "status"> & { id?: string }
) {
  const timestamp = now();
  const task: LocalTrainingTask = {
    ...data,
    id: data.id ?? nanoid(),
    status: "not_started",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  // Always seed IndexedDB so the coach UI has definitions even when remote
  // training_tasks is empty / RLS-blocked / table missing.
  const existing = await localDB.trainingTasks.get(task.id);
  if (!existing) {
    await localDB.trainingTasks.add(task);
  }
  if (isCollaborativeMode()) {
    try {
      await remoteInsert("training_tasks", task as unknown as Record<string, unknown>);
    } catch {
      // Remote mirror is best-effort; local row is enough for the learner UI.
    }
  }
  return task.id;
}

/** Upserts a learner's submission and syncs the parent task status. */
export async function upsertTrainingSubmission(
  data: Omit<LocalTrainingSubmission, "id" | "updatedAt">
) {
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: task, error: taskError } = await client.from("training_tasks").select("program_id").eq("id", data.taskId).single();
    if (taskError) throw taskError;
    const { data: submission, error } = await client.from("training_submissions").upsert({
      program_id: task.program_id, task_id: data.taskId, learner_id: auth.user.id,
      answers: data.answers, reflection: data.reflection, status: data.status, updated_at: now(),
    }, { onConflict: "program_id,task_id,learner_id" }).select("id").single();
    if (error) throw error;
    await client.from("training_tasks").update({ status: data.status, updated_at: now() }).eq("id", data.taskId);
    return submission.id as string;
  }
  const existing = await localDB.trainingSubmissions
    .where("taskId")
    .equals(data.taskId)
    .first();
  const submission: LocalTrainingSubmission = {
    ...data,
    id: existing?.id ?? nanoid(),
    updatedAt: now(),
  };
  await localDB.trainingSubmissions.put(submission);
  await localDB.trainingTasks.update(data.taskId, { status: data.status, updatedAt: submission.updatedAt });
  return submission.id;
}

/** Creates an evidence card and returns its new id. */
export async function createEvidenceCard(
  data: Omit<LocalEvidenceCard, "id" | "createdAt" | "updatedAt">
) {
  const timestamp = now();
  const card: LocalEvidenceCard = { ...data, id: nanoid(), createdAt: timestamp, updatedAt: timestamp };
  if (isCollaborativeMode()) await remoteInsert("evidence_cards", card as unknown as Record<string, unknown>);
  else await localDB.evidenceCards.add(card);
  return card.id;
}

/** Patches an evidence card and refreshes its updatedAt. */
export async function updateEvidenceCard(id: string, data: Partial<LocalEvidenceCard>) {
  if (isCollaborativeMode()) await remoteUpdate("evidence_cards", id, { ...data, updatedAt: now() });
  else await localDB.evidenceCards.update(id, { ...data, updatedAt: now() });
}

/** Records a reviewer decision and advances the submission status locally. */
export async function createTrainingReview(
  data: Omit<LocalTrainingReview, "id" | "createdAt">
) {
  if (isCollaborativeMode()) {
    const response = await fetch("/api/training/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getCollaborativeAuthHeaders()),
      },
      body: JSON.stringify({
        submissionId: data.submissionId,
        decision: data.decision,
        feedback: data.feedback,
        score: data.score,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined);
      throw new Error(payload?.error ?? "TRAINING_REVIEW_FAILED");
    }
    return data.submissionId;
  }
  const review: LocalTrainingReview = { ...data, id: nanoid(), createdAt: now() };
  await localDB.trainingReviews.add(review);
  await localDB.trainingSubmissions.update(data.submissionId, {
    status: data.decision === "approved" ? "completed" : data.decision === "needs_revision" ? "needs_review" : "reviewed",
    updatedAt: review.createdAt,
  });
  return review.id;
}

/** Persists an AI consent record locally or posts it to the consents API. */
export async function recordAiConsent(
  data: Omit<LocalAiConsent, "id" | "consentedAt">
) {
  const consent: LocalAiConsent = {
    purpose: "agent_run",
    ...data,
    id: nanoid(),
    consentedAt: now(),
  };
  if (process.env.NEXT_PUBLIC_COLLABORATIVE_MODE === "true") {
    const response = await fetch("/api/ai/consents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getCollaborativeAuthHeaders()),
      },
      body: JSON.stringify({
        id: consent.id,
        projectId: consent.projectId,
        programId: consent.programId,
        trainingTaskId: consent.trainingTaskId,
        purpose: consent.purpose ?? "agent_run",
        dataCategories: consent.dataCategories,
        externalServices: consent.externalServices,
        redactionConfirmed: consent.redactionConfirmed,
        sensitiveScan: consent.sensitiveScan,
        consentedAt: consent.consentedAt,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "AI_CONSENT_FAILED");
    const saved: LocalAiConsent = {
      ...consent,
      ...(payload.data ?? {}),
      id: consent.id,
      projectId: consent.projectId,
      redactionConfirmed: true,
      consentedAt: consent.consentedAt,
      externalServices: consent.externalServices,
      dataCategories: consent.dataCategories,
    };
    latestCollaborativeConsent = saved;
    return saved;
  }
  await localDB.aiConsents.add(consent);
  return consent;
}

/** Returns whether a valid AI consent exists within the last 30 minutes. */
export async function hasRecentAiConsent(projectId: string, trainingTaskId?: string) {
  if (isCollaborativeMode()) return Boolean(await getRecentAiConsent(projectId, trainingTaskId));
  const rows = await localDB.aiConsents.where("projectId").equals(projectId).toArray();
  return rows.some((row) => {
    if (trainingTaskId && row.trainingTaskId !== trainingTaskId) return false;
    return Date.now() - new Date(row.consentedAt).getTime() < 30 * 60 * 1000;
  });
}

/** Finds the most recent AI consent within the 30-minute freshness window. */
export async function getRecentAiConsent(projectId: string, trainingTaskId?: string) {
  if (isCollaborativeMode()) {
    if (latestCollaborativeConsent?.projectId === projectId &&
      Date.now() - new Date(latestCollaborativeConsent.consentedAt).getTime() < 30 * 60 * 1000) {
      return latestCollaborativeConsent;
    }
    const client = getCollaborativeClient();
    if (!client) return undefined;
    const { data } = await client.from("ai_consents").select("*").eq("project_id", projectId).order("consented_at", { ascending: false }).limit(10);
    const row = (data ?? []).find((item) => (!trainingTaskId || item.training_task_id === trainingTaskId) && Date.now() - new Date(item.consented_at).getTime() < 30 * 60 * 1000);
    return row
      ? {
          id: row.id,
          projectId: row.project_id,
          programId: row.program_id ?? undefined,
          trainingTaskId: row.training_task_id ?? undefined,
          purpose: row.purpose ?? undefined,
          dataCategories: row.data_categories ?? [],
          externalServices: row.external_services,
          redactionConfirmed: row.redaction_confirmed,
          sensitiveScan: row.sensitive_scan ?? undefined,
          consentedAt: row.consented_at,
        }
      : undefined;
  }
  const rows = (await localDB.aiConsents.where("projectId").equals(projectId).toArray())
    .sort((a, b) => new Date(b.consentedAt).getTime() - new Date(a.consentedAt).getTime());
  return rows.find((row) => {
    if (trainingTaskId && row.trainingTaskId !== trainingTaskId) return false;
    return Date.now() - new Date(row.consentedAt).getTime() < 30 * 60 * 1000;
  });
}
