import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted for variables referenced in vi.mock factories
const { mockTables, tableNames } = vi.hoisted(() => {
  const names = [
    "projects", "manuscripts", "manuscriptBlocks", "bibItems",
    "attachments", "ragChunks", "experiments", "submissions",
    "reviewRounds", "rebuttalItems", "agentRuns", "auditLedger", "tasks",
  ];
  const tables: Record<string, any[]> = {};
  return { mockTables: tables, tableNames: names };
});

function mockTable(name: string) {
  return {
    name,
    toArray: vi.fn(async () => mockTables[name] ?? []),
    clear: vi.fn(async () => {
      mockTables[name] = [];
    }),
    bulkAdd: vi.fn(async (rows: any[]) => {
      mockTables[name] = rows;
    }),
  };
}

vi.mock("@/lib/local/db", () => ({
  localDB: {
    tables: tableNames.map((name: string) => mockTable(name)),
    table: (name: string) => mockTable(name),
    transaction: vi.fn((_mode: string, _tables: any, fn: () => Promise<void>) => fn()),
  },
}));

import { exportAllData, importAllData, downloadExport } from "@/lib/local/export";

describe("exportAllData", () => {
  beforeEach(() => {
    for (const name of tableNames) {
      mockTables[name] = [];
    }
  });

  it("returns a Blob with correct JSON structure", async () => {
    mockTables.projects = [{ id: "p1", name: "Test Project" }];

    const blob = await exportAllData();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");

    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe("6.0");
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.data).toBeDefined();
    expect(parsed.data.projects).toHaveLength(1);
  });
});

describe("importAllData", () => {
  beforeEach(() => {
    for (const name of tableNames) {
      mockTables[name] = [];
    }
  });

  it("throws for wrong version", async () => {
    const payload = {
      version: "5.1",
      exportedAt: "2024-01-01T00:00:00.000Z",
      data: {},
    };

    const file = new File(
      [JSON.stringify(payload)],
      "backup.json",
      { type: "application/json" }
    );

    await expect(importAllData(file)).rejects.toThrow("Incompatible version");
  });

  it("throws for invalid JSON", async () => {
    const file = new File(["not json"], "backup.json", {
      type: "application/json",
    });

    await expect(importAllData(file)).rejects.toThrow();
  });
});
