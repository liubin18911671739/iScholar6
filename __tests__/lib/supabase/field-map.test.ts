import { describe, expect, it } from "vitest";
import {
  DEXIE_TO_REMOTE_TABLE,
  REMOTE_COLUMN_MAP,
  REMOTE_OMIT_KEYS,
  fromRemoteRecord,
  toRemoteRecord,
} from "@/lib/supabase/field-map";

describe("collaborative field mapping", () => {
  it("maps Dexie core tables to remote snake_case table names", () => {
    expect(DEXIE_TO_REMOTE_TABLE.manuscriptBlocks).toBe("manuscript_blocks");
    expect(DEXIE_TO_REMOTE_TABLE.bibItems).toBe("bib_items");
    expect(DEXIE_TO_REMOTE_TABLE.agentRuns).toBe("agent_runs");
    expect(DEXIE_TO_REMOTE_TABLE.trainingTasks).toBe("training_tasks");
  });

  it("maps order to ordinal and common camelCase timestamps", () => {
    expect(REMOTE_COLUMN_MAP.order).toBe("ordinal");
    expect(REMOTE_COLUMN_MAP.projectId).toBe("project_id");
    expect(REMOTE_COLUMN_MAP.blockId).toBe("block_id");
    expect(REMOTE_COLUMN_MAP.taskId).toBe("task_id");
    expect(REMOTE_COLUMN_MAP.createdAt).toBe("created_at");
    expect(REMOTE_COLUMN_MAP.agentRunId).toBe("agent_run_id");
  });

  it("toRemoteRecord renames fields and drops local blobs", () => {
    const remote = toRemoteRecord({
      id: "block-1",
      manuscriptId: "ms-1",
      blockId: "b1",
      taskId: "t1",
      section: "introduction",
      order: 2,
      content: "hello",
      authorType: "human",
      agentRunId: "run-1",
      updatedAt: "2026-07-17T00:00:00.000Z",
      data: new Blob(["x"]),
      embeddingData: new ArrayBuffer(8),
    });

    expect(remote).toEqual({
      id: "block-1",
      manuscript_id: "ms-1",
      block_id: "b1",
      task_id: "t1",
      section: "introduction",
      ordinal: 2,
      content: "hello",
      author_type: "human",
      agent_run_id: "run-1",
      updated_at: "2026-07-17T00:00:00.000Z",
    });
    for (const key of REMOTE_OMIT_KEYS) {
      expect(remote).not.toHaveProperty(key);
    }
  });

  it("fromRemoteRecord restores camelCase aliases used by the app", () => {
    const local = fromRemoteRecord({
      id: "run-1",
      project_id: "p1",
      manuscript_id: "ms-1",
      block_id: "b1",
      task_id: "t1",
      agent: "topic",
      status: "needs_review",
      model_name: "deepseek-chat",
      token_in: 10,
      token_out: 20,
      cost_cents: 1,
      latency_ms: 500,
      started_at: "2026-07-17T00:00:00.000Z",
      ended_at: "2026-07-17T00:00:01.000Z",
      agent_run_id: "run-1",
      author_type: "human",
      content_hash: "abc",
      ordinal: 3,
    });

    expect(local.projectId).toBe("p1");
    expect(local.manuscriptId).toBe("ms-1");
    expect(local.blockId).toBe("b1");
    expect(local.taskId).toBe("t1");
    expect(local.modelName).toBe("deepseek-chat");
    expect(local.tokenIn).toBe(10);
    expect(local.tokenOut).toBe(20);
    expect(local.costCents).toBe(1);
    expect(local.latencyMs).toBe(500);
    expect(local.startedAt).toBe("2026-07-17T00:00:00.000Z");
    expect(local.endedAt).toBe("2026-07-17T00:00:01.000Z");
    expect(local.agentRunId).toBe("run-1");
    expect(local.authorType).toBe("human");
    expect(local.contentHash).toBe("abc");
    expect(local.order).toBe(3);
  });

  it("keeps unmapped keys stable for forward compatibility", () => {
    const remote = toRemoteRecord({ id: "x", customFlag: true, status: "draft" });
    expect(remote).toEqual({ id: "x", customFlag: true, status: "draft" });
  });
});
