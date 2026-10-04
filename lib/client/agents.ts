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
  input?: Record<string, unknown> | null;
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

/** Handlers for a run's backend SSE stream. */
export interface RunEventHandlers {
  /** Incremental model text (`message.delta` events). */
  onDelta?: (text: string) => void;
  /** Terminal status from the `end` event. */
  onEnd?: (status: string) => void;
}

/**
 * Subscribe to a run's backend SSE stream (`/runs/{id}/events`), delivering
 * `message.delta` chunks and the terminal `end` event. Returns an unsubscribe
 * function; no-op when `EventSource` is unavailable (SSR/tests).
 */
export function subscribeRunEvents(runId: string, handlers: RunEventHandlers): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`${BASE}/runs/${runId}/events`);
  source.addEventListener("message.delta", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { text?: string };
      if (payload.text) handlers.onDelta?.(payload.text);
    } catch {
      /* ignore malformed frames */
    }
  });
  source.addEventListener("end", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { status?: string };
      handlers.onEnd?.(payload.status ?? "");
    } catch {
      handlers.onEnd?.("");
    }
    source.close();
  });
  return () => source.close();
}

/** Parameters for a Hermes module-assistant chat turn. */
export interface HermesRunParams {
  projectId: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  consentId?: string;
  onChunk: (chunk: string) => void;
  onComplete: (runId: string) => void;
  onError: (error: Error) => void;
}

/**
 * Run one Hermes chat turn on the backend (`agent: "hermes"`) and deliver the
 * reply text. The Hermes graph is non-streaming, so text arrives in one chunk.
 */
export async function runHermes(params: HermesRunParams): Promise<void> {
  const POLL_MS = 700;
  const TIMEOUT_MS = 120_000;
  try {
    const thread = await createThread(params.projectId, "hermes:assistant");
    const run = await createRun(thread.id, {
      agent: "hermes",
      goal: params.messages[params.messages.length - 1]?.content?.slice(0, 20_000) || "hermes:assistant",
      input: { messages: params.messages, agent: params.agentId },
      consentId: params.consentId,
    });
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const detail = await getRun(run.id);
      const draft = (detail.result as { draft?: { text?: string } } | null)?.draft;
      if (draft?.text) {
        params.onChunk(draft.text);
        params.onComplete(run.id);
        return;
      }
      if (detail.status === "failed" || detail.status === "cancelled") {
        throw new Error(detail.error ?? `RUN_${detail.status.toUpperCase()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    throw new Error("HERMES_TIMEOUT");
  } catch (error) {
    params.onError(error instanceof Error ? error : new Error(String(error)));
  }
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
