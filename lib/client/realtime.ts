/**
 * Backend realtime client (lib/client/realtime.ts)
 *
 * Subscribes to the training ops SSE stream (`/api/realtime/training`) and
 * delivers named events to the caller.
 *
 * @author mrpi
 * @date 2026-09-30
 */

export interface TrainingOpsEvent {
  kind: string;
  data: Record<string, unknown>;
}

const TRAINING_KINDS = ["training.submission", "training.review"];

/** Subscribe to camp submission/review events. Returns an unsubscribe function. */
export function subscribeTrainingOps(
  programIds: string[],
  onEvent: (event: TrainingOpsEvent) => void
): () => void {
  if (programIds.length === 0 || typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  const url = `/api/realtime/training?programIds=${encodeURIComponent(programIds.join(","))}`;
  const source = new EventSource(url);
  for (const kind of TRAINING_KINDS) {
    source.addEventListener(kind, (event) => {
      try {
        onEvent({ kind, data: JSON.parse((event as MessageEvent).data) });
      } catch {
        /* ignore malformed frames */
      }
    });
  }
  return () => source.close();
}
