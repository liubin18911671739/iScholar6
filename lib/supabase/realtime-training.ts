/**
 * Training Realtime Subscriptions (lib/supabase/realtime-training.ts)
 *
 * Functionality:
 * - Subscribes to `training_submissions` / `training_reviews` Postgres changes via Supabase Realtime.
 * - Normalizes change payloads into metadata-only `TrainingRealtimeEvent` objects.
 * - Filters events by optional program ids and reports channel errors through `onError`.
 *
 * Notes:
 * - Client-only ("use client"); the returned unsubscribe function removes both channels.
 *
 * @author mrpi
 * @date 2026-09-16
 */

"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** Metadata-only realtime event emitted for camp submissions and reviews. */
export type TrainingRealtimeEvent = {
  table: "training_submissions" | "training_reviews";
  eventType: "INSERT" | "UPDATE" | "DELETE";
  programId?: string;
  taskId?: string;
  status?: string;
  submissionId?: string;
  record: Record<string, unknown>;
};

/**
 * Subscribe to camp submission/review changes for the staff/TA console.
 * Payload is metadata only (no answer bodies are required for toasts).
 */
export function subscribeTrainingOps(
  client: SupabaseClient,
  options: {
    programIds?: string[];
    onEvent: (event: TrainingRealtimeEvent) => void;
    onError?: (error: Error) => void;
  }
): () => void {
  const channels: RealtimeChannel[] = [];

  // Normalize a change payload and forward it only when it matches the program filter.
  const handle = (
    table: TrainingRealtimeEvent["table"],
    payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }
  ) => {
    const record = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
    const programId = (record.program_id as string | undefined) ?? undefined;
    if (
      options.programIds &&
      options.programIds.length > 0 &&
      programId &&
      !options.programIds.includes(programId)
    ) {
      return;
    }
    options.onEvent({
      table,
      eventType: payload.eventType as TrainingRealtimeEvent["eventType"],
      programId,
      taskId: (record.task_id as string | undefined) ?? undefined,
      status: (record.status as string | undefined) ?? undefined,
      submissionId: (record.id as string | undefined) ?? (record.submission_id as string | undefined),
      record: {
        id: record.id,
        program_id: record.program_id,
        task_id: record.task_id,
        status: record.status,
        updated_at: record.updated_at,
        peer_status: record.peer_status,
      },
    });
  };

  try {
    // Submission channel: insert/update/delete feed the ops review queue.
    const subChannel = client
      .channel("training-ops-submissions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "training_submissions" },
        (payload) => handle("training_submissions", payload as never)
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          options.onError?.(new Error("REALTIME_SUBMISSIONS_CHANNEL_ERROR"));
        }
      });
    channels.push(subChannel);

    // Review channel: inserts only (a new review appears in the queue).
    const revChannel = client
      .channel("training-ops-reviews")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "training_reviews" },
        (payload) => handle("training_reviews", payload as never)
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          options.onError?.(new Error("REALTIME_REVIEWS_CHANNEL_ERROR"));
        }
      });
    channels.push(revChannel);
  } catch (e) {
    options.onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  return () => {
    for (const ch of channels) {
      void client.removeChannel(ch);
    }
  };
}
