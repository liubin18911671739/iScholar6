/**
 * Agent client (lib/client/agents.ts)
 *
 * Typed browser client for the durable backend agent runtime via the signed BFF
 * (`/api/agent/*`): threads, runs, artifacts, and review transitions.
 */

import { qs, request } from "@/lib/client/http";

const BASE = "/api/agent";

export type ArtifactStatus = "draft" | "approved" | "rejected" | "applied";

export interface RunArtifact {
  id: string;
  kind: string;
  status: string;
  content: {
    text?: string;
    structured?: unknown;
    sources?: unknown[];
    usage?: { tokenIn?: number; tokenOut?: number };
  };
  reviewedAt?: string | null;
}

export interface AgentRunDetail {
  id: string;
  threadId: string;
  projectId: string;
  agent: string;
  goal: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  cancelRequested: boolean;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  trainingTaskId?: string | null;
  programId?: string | null;
  mode?: string | null;
  artifacts: RunArtifact[];
}

export interface CreateRunInput {
  agent: string;
  goal: string;
  input?: Record<string, unknown>;
  systemPrompt?: string;
  userPrompt?: string;
  consentId?: string;
  trainingTaskId?: string;
  programId?: string;
  mode?: string;
  idempotencyKey?: string;
}

/** Create a thread for a project. */
export async function createThread(projectId: string, title?: string): Promise<{ id: string }> {
  return request<{ id: string }>(`${BASE}/threads`, {
    method: "POST",
    body: JSON.stringify({ projectId, title }),
  });
}

/** Create a durable run. */
export async function createRun(threadId: string, input: CreateRunInput): Promise<AgentRunDetail> {
  const headers: Record<string, string> = {};
  if (input.idempotencyKey) headers["idempotency-key"] = input.idempotencyKey;
  return request<AgentRunDetail>(`${BASE}/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      threadId,
      goal: input.goal,
      agent: input.agent,
      input: input.input ?? {},
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      consentId: input.consentId,
      trainingTaskId: input.trainingTaskId,
      programId: input.programId,
      mode: input.mode,
    }),
  });
}

/** Fetch one run with its artifacts. */
export async function getRun(runId: string): Promise<AgentRunDetail> {
  return request<AgentRunDetail>(`${BASE}/runs/${runId}`);
}

/** List the caller's runs for a project, newest first. */
export async function listRuns(projectId: string, limit = 50): Promise<AgentRunDetail[]> {
  return request<AgentRunDetail[]>(`${BASE}/runs${qs({ projectId, limit })}`);
}

/** Approve/reject/apply an artifact. */
export async function reviewArtifact(
  artifactId: string,
  status: Exclude<ArtifactStatus, "draft">,
  feedback?: string
): Promise<RunArtifact> {
  return request<RunArtifact>(`${BASE}/artifacts/${artifactId}/review`, {
    method: "POST",
    body: JSON.stringify({ status, feedback }),
  });
}

/** Review the latest artifact of a run (fetches the run first). */
export async function reviewLatestArtifact(
  runId: string,
  status: Exclude<ArtifactStatus, "draft">,
  feedback?: string
): Promise<RunArtifact | undefined> {
  const run = await getRun(runId);
  const artifact = run.artifacts[run.artifacts.length - 1];
  if (!artifact) return undefined;
  return reviewArtifact(artifact.id, status, feedback);
}

/** Resume an interrupted run. */
export async function resumeRun(runId: string, approved?: boolean, input?: Record<string, unknown>): Promise<AgentRunDetail> {
  return request<AgentRunDetail>(`${BASE}/runs/${runId}/resume`, {
    method: "POST",
    body: JSON.stringify({ approved, input: input ?? {} }),
  });
}

/** Cancel a run. */
export async function cancelRun(runId: string): Promise<AgentRunDetail> {
  return request<AgentRunDetail>(`${BASE}/runs/${runId}/cancel`, { method: "POST" });
}

/** Latest approved artifact usage for progress calibration. */
export async function latestApprovedUsage(
  projectId: string,
  agent: string
): Promise<{ tokenOut: number } | undefined> {
  try {
    const runs = await listRuns(projectId);
    for (const run of runs) {
      if (run.agent !== agent) continue;
      const approved = run.artifacts.find((a) => a.status === "approved" || a.status === "applied");
      if (approved?.content?.usage?.tokenOut) {
        return { tokenOut: approved.content.usage.tokenOut };
      }
    }
  } catch {
    // Best-effort; callers fall back to a static estimate.
  }
  return undefined;
}
