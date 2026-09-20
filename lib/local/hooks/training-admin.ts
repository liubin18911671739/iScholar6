/**
 * Training Admin Hooks (lib/local/hooks/training-admin.ts)
 *
 * Functionality:
 * - Loads training programs, enrollments, the review queue, and class reports for admins.
 * - Uses manual Supabase queries with reload tokens in collaborative mode, Dexie live queries otherwise.
 * - Creates training programs and enrolls learners, returning the new id.
 *
 * Notes:
 * - Class reports are assembled via buildClassReport/scoreSubmission from lib/training/scoring.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { localDB, type LocalTrainingEnrollment, type LocalTrainingProgram } from "../db";
import { buildClassReport, scoreSubmission } from "@/lib/training/scoring";
import { getCollaborativeClient, isCollaborativeMode } from "@/lib/supabase/collaborative";
import type { RemoteListQuery } from "@/lib/supabase/remote-query";

// Current ISO timestamp for locally created admin records.
const timestamp = () => new Date().toISOString();
// Superset shape for the class report hook's optional metadata fields.
type ClassReportSummary = { memberCount?: number; [key: string]: unknown };

// Builds a localized, user-facing error message for failed admin queries.
function formatAdminError(resource: string, message?: string) {
  const detail = message?.trim() ? `（${message.trim()}）` : "";
  return `无法从 Supabase 加载「${resource}」${detail}。请检查登录状态、权限或网络连接后重试。`;
}

/** Loads all training programs, remote-first in collaborative mode. */
export function useTrainingPrograms(): RemoteListQuery<LocalTrainingProgram> {
  const [remote, setRemote] = useState<LocalTrainingProgram[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!isCollaborativeMode()) return;
    let cancelled = false;
    setRemote(undefined);
    setError(null);
    const client = getCollaborativeClient();
    if (!client) {
      setError(formatAdminError("训练营", "未登录或客户端未配置"));
      return;
    }
    client.from("training_programs").select("*").order("updated_at", { ascending: false }).then(({ data, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        console.error("Supabase query training_programs failed", queryError);
        setRemote(undefined);
        setError(formatAdminError("训练营", queryError.message));
        return;
      }
      setError(null);
      setRemote((data ?? []).map((p) => ({ ...p, createdAt: p.created_at, updatedAt: p.updated_at })));
    });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const local = useLiveQuery(() => localDB.trainingPrograms.orderBy("updatedAt").reverse().toArray(), []);
  return isCollaborativeMode()
    ? { data: remote, error, refetch }
    : { data: local, error: null, refetch: () => {} };
}

/** Loads enrollments for a training program. */
export function useTrainingEnrollments(programId: string): RemoteListQuery<LocalTrainingEnrollment> {
  const [remote, setRemote] = useState<LocalTrainingEnrollment[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!isCollaborativeMode()) return;
    let cancelled = false;
    setRemote(undefined);
    setError(null);
    const client = getCollaborativeClient();
    if (!client) {
      setError(formatAdminError("报名列表", "未登录或客户端未配置"));
      return;
    }
    client.from("training_enrollments").select("*").eq("program_id", programId).then(({ data, error: queryError }) => {
      if (cancelled) return;
      if (queryError) {
        console.error("Supabase query training_enrollments failed", queryError);
        setRemote(undefined);
        setError(formatAdminError("报名列表", queryError.message));
        return;
      }
      setError(null);
      setRemote((data ?? []).map((e) => ({ ...e, programId: e.program_id, learnerId: e.learner_id, joinedAt: e.joined_at })));
    });
    return () => { cancelled = true; };
  }, [programId, reloadToken]);

  const local = useLiveQuery(() => localDB.enrollments.where("programId").equals(programId).toArray(), [programId]);
  return isCollaborativeMode()
    ? { data: remote, error, refetch }
    : { data: local, error: null, refetch: () => {} };
}

/** Loads submitted training work joined with its task and evidence cards. */
export function useReviewQueue(): RemoteListQuery<Record<string, unknown>> {
  const [remote, setRemote] = useState<Array<Record<string, unknown>> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!isCollaborativeMode()) return;
    let cancelled = false;
    setRemote(undefined);
    setError(null);
    const client = getCollaborativeClient();
    if (!client) {
      setError(formatAdminError("审核队列", "未登录或客户端未配置"));
      return;
    }
    Promise.all([
      client.from("training_submissions").select("*").eq("status", "submitted"),
      client.from("training_tasks").select("*"),
      client.from("evidence_cards").select("*"),
    ]).then(([submissionResult, taskResult, evidenceResult]) => {
      if (cancelled) return;
      const firstError = submissionResult.error ?? taskResult.error ?? evidenceResult.error;
      if (firstError) {
        console.error("Supabase review queue query failed", firstError);
        setRemote(undefined);
        setError(formatAdminError("审核队列", firstError.message));
        return;
      }
      const tasks = taskResult.data ?? [];
      const evidence = evidenceResult.data ?? [];
      setError(null);
      setRemote((submissionResult.data ?? []).map((submission) => ({
        submission: { ...submission, taskId: submission.task_id, projectId: submission.project_id, submittedAt: submission.submitted_at, updatedAt: submission.updated_at },
        task: tasks.find((task) => task.id === submission.task_id),
        evidence: evidence.filter((card) => card.submission_id === submission.id),
      })));
    });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const local = useLiveQuery(async () => {
    const submissions = await localDB.trainingSubmissions.where("status").equals("submitted").toArray();
    return Promise.all(submissions.map(async (submission) => ({
      submission,
      task: await localDB.trainingTasks.get(submission.taskId),
      evidence: await localDB.evidenceCards.where("submissionId").equals(submission.id).toArray(),
    })));
  }, []);
  return isCollaborativeMode()
    ? { data: remote, error, refetch }
    : { data: local as Array<Record<string, unknown>> | undefined, error: null, refetch: () => {} };
}

/** Builds an aggregated class report for a training program. */
export function useTrainingClassReport(programId: string): { data: ClassReportSummary | undefined; error: string | null; refetch: () => void } {
  const [remote, setRemote] = useState<ClassReportSummary | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!isCollaborativeMode()) return;
    let cancelled = false;
    setRemote(undefined);
    setError(null);
    const client = getCollaborativeClient();
    if (!client) {
      setError(formatAdminError("班级报告", "未登录或客户端未配置"));
      return;
    }
    Promise.all([
      client.from("training_enrollments").select("*").eq("program_id", programId),
      client.from("training_tasks").select("*").eq("program_id", programId),
      client.from("training_submissions").select("*"),
    ]).then(([enrollmentResult, taskResult, submissionResult]) => {
      if (cancelled) return;
      const firstError = enrollmentResult.error ?? taskResult.error ?? submissionResult.error;
      if (firstError) {
        console.error("Supabase class report query failed", firstError);
        setRemote(undefined);
        setError(formatAdminError("班级报告", firstError.message));
        return;
      }
      const tasks = (taskResult.data ?? []).map((task) => ({ ...task, projectId: task.project_id, createdAt: task.created_at, updatedAt: task.updated_at, steps: task.steps ?? [] }));
      const submissions = submissionResult.data ?? [];
      const members = (enrollmentResult.data ?? []).map((enrollment) => {
        const memberTasks = tasks.filter((task) => task.projectId === enrollment.learner_id);
        const scores = Object.fromEntries(memberTasks.map((task) => {
          const submission = submissions.find((item) => item.task_id === task.id);
          return [task.dimension, scoreSubmission(submission as never, task.steps.length)];
        }));
        const values = Object.values(scores) as number[];
        return { learnerId: enrollment.learner_id, displayName: undefined, scores: scores as never, overall: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0 };
      });
      setError(null);
      setRemote(buildClassReport(members));
    });
    return () => { cancelled = true; };
  }, [programId, reloadToken]);

  const local = useLiveQuery(async () => {
    const enrollments = await localDB.enrollments.where("programId").equals(programId).toArray();
    const tasks = (await localDB.trainingTasks.toArray()).filter((task) => !task.programId || task.programId === programId);
    const submissions = await localDB.trainingSubmissions.toArray();
    const members = enrollments.map((enrollment) => {
      const memberTasks = tasks.filter((task) => task.projectId === enrollment.learnerId);
      const scores = Object.fromEntries(memberTasks.map((task) => {
        const submission = submissions.find((item) => item.taskId === task.id);
        return [task.dimension, scoreSubmission(submission, task.steps.length)];
      }));
      const values = Object.values(scores) as number[];
      return { learnerId: enrollment.learnerId, displayName: enrollment.displayName, scores: scores as never, overall: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0 };
    });
    return buildClassReport(members);
  }, [programId]);

  return isCollaborativeMode()
    ? { data: remote, error, refetch }
    : { data: local, error: null, refetch: () => {} };
}

/** Creates a training program and returns its new id. */
export async function createTrainingProgram(data: Omit<LocalTrainingProgram, "id" | "createdAt" | "updatedAt">) {
  const time = timestamp();
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: program, error } = await client.from("training_programs").insert({ ...data, owner_id: auth.user.id, created_at: time, updated_at: time }).select("id").single();
    if (error) throw error;
    return program.id as string;
  }
  const program = { ...data, id: nanoid(), createdAt: time, updatedAt: time };
  await localDB.trainingPrograms.add(program);
  return program.id;
}

/** Enrolls a learner in a program as active and returns the enrollment id. */
export async function enrollLearner(data: Omit<LocalTrainingEnrollment, "id" | "joinedAt" | "status">) {
  const enrollment: LocalTrainingEnrollment = { ...data, id: nanoid(), joinedAt: timestamp(), status: "active" };
  if (isCollaborativeMode()) {
    const client = getCollaborativeClient();
    if (!client) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("COLLABORATIVE_AUTH_REQUIRED");
    const { data: result, error } = await client.from("training_enrollments").insert({ program_id: data.programId, learner_id: data.learnerId, status: "active", joined_at: enrollment.joinedAt }).select("id").single();
    if (error) throw error;
    return result.id as string;
  }
  await localDB.enrollments.add(enrollment);
  return enrollment.id;
}
