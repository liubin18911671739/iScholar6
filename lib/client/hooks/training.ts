/**
 * Backend training hooks (lib/client/hooks/training.ts)
 *
 * React Query read hooks for the training BFF. Mutations live in
 * `lib/client/training.ts` (called imperatively by the components).
 *
 * @author mrpi
 * @date 2026-09-30
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/client/training";
import { getQueryClient } from "@/lib/client/query-client";
import { qk } from "./keys";
import { errorMessage } from "./shared";

/** Invalidate every training query (after a mutation). */
export function invalidateTrainingQueries(): Promise<void> {
  return getQueryClient().invalidateQueries({ queryKey: ["training"] });
}

/** Learner enrollments + (optionally) submissions. */
export function useMyTraining(include: "enrollments" | "submissions" | "all" = "all") {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingMe,
    queryFn: () => api.getMyTraining(include),
  });
  return { enrollments: data?.enrollments, submissions: data?.submissions, error: error ? errorMessage(error) : null, refetch };
}

/** Programs visible to the caller (staff/TA scoped). */
export function useTrainingPrograms() {
  const { data, error, refetch } = useQuery({ queryKey: qk.trainingPrograms, queryFn: api.listPrograms });
  return { data: data?.data, access: data?.access, scope: data?.scope, error: error ? errorMessage(error) : null, refetch };
}

/** A program's configured tasks + resolved curriculum. */
export function useProgramTasks(programId: string) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingTasks(programId),
    queryFn: () => api.getProgramTasks(programId),
    enabled: Boolean(programId),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Self/class progress for a program. */
export function useProgramProgress(programId: string, learnerId?: string) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingProgress(programId, learnerId),
    queryFn: () => api.getProgramProgress(programId, learnerId),
    enabled: Boolean(programId),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Class report for a program. */
export function useClassReport(programId: string) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingReport(programId),
    queryFn: () => api.getReport(programId),
    enabled: Boolean(programId),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Reviewer queue (paginated/filtered). */
export function useReviewQueue(params: Record<string, string | number | boolean | undefined>) {
  const key = JSON.stringify(params);
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingReviews(key),
    queryFn: () => api.listReviews(params),
  });
  return {
    data: data?.data,
    total: data?.total ?? 0,
    access: data?.access,
    error: error ? errorMessage(error) : null,
    refetch,
  };
}

/** Peer-review assignments for the caller. */
export function usePeerQueue() {
  const { data, error, refetch } = useQuery({ queryKey: qk.trainingPeer, queryFn: api.listPeer });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Cross-program analytics dashboard. */
export function useAnalyticsDashboard(params: Record<string, string | undefined> = {}) {
  const key = JSON.stringify(params);
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingAnalytics(key),
    queryFn: () => api.getAnalytics(params),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Due-task calendar for a month. */
export function useDueCalendar(year: number, month: number) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingCalendar(year, month),
    queryFn: () => api.getCalendar({ year, month }),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Consent audit rows for a program. */
export function useConsentAudit(programId: string, purpose?: string) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingConsents(programId, purpose),
    queryFn: () => api.listConsents(programId, { purpose, pageSize: 15 }),
    enabled: Boolean(programId),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Builtin + stored task packs. */
export function useTaskPacks() {
  const { data, error, refetch } = useQuery({ queryKey: qk.trainingTaskPacks, queryFn: api.listTaskPacks });
  return { data, error: error ? errorMessage(error) : null, refetch };
}

/** Program LMS link. */
export function useLmsLink(programId: string) {
  const { data, error, refetch } = useQuery({
    queryKey: qk.trainingLmsLink(programId),
    queryFn: () => api.getLmsLink(programId),
    enabled: Boolean(programId),
  });
  return { data, error: error ? errorMessage(error) : null, refetch };
}
