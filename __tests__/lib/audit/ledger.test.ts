import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nanoid for predictable IDs
vi.mock("nanoid", () => ({
  nanoid: () => "test-id-1",
}));

// Mock localDB with an in-memory store
const auditStore: any[] = [];
vi.mock("@/lib/local/db", () => ({
  localDB: {
    auditLedger: {
      add: vi.fn(async (entry: any) => {
        auditStore.push({ ...entry });
      }),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          reverse: vi.fn(() => ({
            sortBy: vi.fn(async () =>
              auditStore
                .filter((e: any) => e.projectId === "proj-1")
                .sort((a: any, b: any) =>
                  b.timestamp.localeCompare(a.timestamp)
                )
            ),
          })),
          sortBy: vi.fn(async () =>
            auditStore
              .filter((e: any) => e.projectId === "proj-1")
              .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp))
          ),
        })),
      })),
    },
  },
}));

import { hashContent, writeAuditEntry, verifyAuditChain } from "@/lib/audit/ledger";

describe("hashContent", () => {
  it("returns a string of expected length (first 16 hex chars of SHA-256)", async () => {
    const hash = await hashContent("test content");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(16);
  });

  it("returns consistent hash for same input", async () => {
    const hash1 = await hashContent("same input");
    const hash2 = await hashContent("same input");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different inputs", async () => {
    const hash1 = await hashContent("input a");
    const hash2 = await hashContent("input b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("writeAuditEntry", () => {
  beforeEach(() => {
    auditStore.length = 0;
  });

  it("creates an entry in the audit ledger", async () => {
    await writeAuditEntry({
      projectId: "proj-1",
      action: "test.action",
      promptHash: "abc123",
    });

    expect(auditStore).toHaveLength(1);
    expect(auditStore[0].projectId).toBe("proj-1");
    expect(auditStore[0].action).toBe("test.action");
    expect(auditStore[0].promptHash).toBe("abc123");
  });

  it("auto-links parentHash from previous entry's outputHash", async () => {
    // First entry with outputHash
    auditStore.push({
      id: "prev-entry",
      projectId: "proj-1",
      action: "agent.topic",
      outputHash: "prev-output-hash",
      timestamp: "2024-01-01T00:00:00.000Z",
    });

    await writeAuditEntry({
      projectId: "proj-1",
      action: "agent.approved",
      outputHash: "new-output-hash",
    });

    const newEntry = auditStore[auditStore.length - 1];
    expect(newEntry.parentHash).toBe("prev-output-hash");
  });
});

describe("verifyAuditChain", () => {
  beforeEach(() => {
    auditStore.length = 0;
  });

  it("returns valid for empty chain", async () => {
    const result = await verifyAuditChain("proj-1");
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it("returns valid for unbroken chain", async () => {
    auditStore.push(
      {
        id: "entry-1",
        projectId: "proj-1",
        action: "agent.topic",
        outputHash: "hash-a",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "entry-2",
        projectId: "proj-1",
        action: "agent.approved",
        outputHash: "hash-b",
        parentHash: "hash-a",
        timestamp: "2024-01-01T00:01:00.000Z",
      }
    );

    const result = await verifyAuditChain("proj-1");
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(2);
  });

  it("returns broken for tampered chain", async () => {
    auditStore.push(
      {
        id: "entry-1",
        projectId: "proj-1",
        action: "agent.topic",
        outputHash: "hash-a",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "entry-2",
        projectId: "proj-1",
        action: "agent.approved",
        outputHash: "hash-b",
        parentHash: "tampered-hash", // mismatch!
        timestamp: "2024-01-01T00:01:00.000Z",
      }
    );

    const result = await verifyAuditChain("proj-1");
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe("entry-2");
    expect(result.totalEntries).toBe(2);
  });
});
