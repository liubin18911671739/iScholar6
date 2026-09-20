import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_VERSION } from "@/lib/local/export";

const { mockTables, tableNames } = vi.hoisted(() => {
  const names = [
    "projects",
    "manuscripts",
    "manuscriptBlocks",
    "bibItems",
    "attachments",
    "ragChunks",
    "experiments",
    "submissions",
    "reviewRounds",
    "rebuttalItems",
    "agentRuns",
    "manuscriptVersions",
    "auditLedger",
    "tasks",
    "trainingPrograms",
    "trainingTasks",
    "trainingSubmissions",
    "evidenceCards",
    "trainingReviews",
    "aiConsents",
    "enrollments",
  ];
  const tables: Record<string, unknown[]> = {};
  return { mockTables: tables, tableNames: names };
});

function mockTable(name: string) {
  return {
    name,
    toArray: vi.fn(async () => mockTables[name] ?? []),
    clear: vi.fn(async () => {
      mockTables[name] = [];
    }),
    bulkAdd: vi.fn(async (rows: unknown[]) => {
      mockTables[name] = rows;
    }),
  };
}

vi.mock("@/lib/local/db", () => ({
  localDB: {
    tables: tableNames.map((name: string) => mockTable(name)),
    table: (name: string) => mockTable(name),
    transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()),
  },
}));

import { exportAllData, importAllData } from "@/lib/local/export";

describe("export/import compatibility", () => {
  beforeEach(() => {
    for (const name of tableNames) mockTables[name] = [];
  });

  it("exports the current backup format version", async () => {
    expect(EXPORT_VERSION).toBe("6.0");
    const blob = await exportAllData();
    const payload = JSON.parse(await blob.text());
    expect(payload.version).toBe(EXPORT_VERSION);
  });

  it("round-trips training tables added in Dexie schema v3", async () => {
    mockTables.trainingPrograms = [{ id: "prog-1", name: "Camp", createdAt: "t1", updatedAt: "t1" }];
    mockTables.trainingTasks = [{ id: "task-1", projectId: "p1", title: "RQ", dimension: "topic", steps: ["a"], status: "not_started" }];
    mockTables.aiConsents = [{ id: "c1", projectId: "p1", externalServices: ["deepseek"], redactionConfirmed: true, consentedAt: "t1" }];

    const blob = await exportAllData();
    const file = new File([await blob.text()], "backup.json", { type: "application/json" });
    await importAllData(file);

    expect(mockTables.trainingPrograms).toHaveLength(1);
    expect(mockTables.trainingTasks[0]).toMatchObject({ id: "task-1", projectId: "p1" });
    expect(mockTables.aiConsents[0]).toMatchObject({ id: "c1", redactionConfirmed: true });
  });

  it("serializes Blob attachment payloads as base64 and restores them", async () => {
    mockTables.attachments = [{
      id: "att-1",
      projectId: "p1",
      filename: "note.txt",
      data: new Blob(["hello-attachment"], { type: "text/plain" }),
      mimeType: "text/plain",
      sizeBytes: 16,
      createdAt: "2026-07-17T00:00:00.000Z",
    }];

    const blob = await exportAllData();
    const text = await blob.text();
    const payload = JSON.parse(text);
    expect(payload.data.attachments[0].data.__type).toBe("Blob");
    expect(typeof payload.data.attachments[0].data.data).toBe("string");

    // Clear then re-import.
    for (const name of tableNames) mockTables[name] = [];
    await importAllData(new File([text], "backup.json", { type: "application/json" }));
    const restored = mockTables.attachments[0] as { data: Blob; filename: string };
    expect(restored.filename).toBe("note.txt");
    expect(restored.data).toBeInstanceOf(Blob);
    expect(await restored.data.text()).toBe("hello-attachment");
  });

  it("rejects incompatible export versions without mutating data", async () => {
    mockTables.projects = [{ id: "keep-me" }];
    const file = new File(
      [JSON.stringify({ version: "5.0", exportedAt: "2020-01-01T00:00:00.000Z", data: { projects: [] } })],
      "old.json",
      { type: "application/json" }
    );
    await expect(importAllData(file)).rejects.toThrow(/Incompatible version/);
    expect(mockTables.projects).toEqual([{ id: "keep-me" }]);
  });
});
