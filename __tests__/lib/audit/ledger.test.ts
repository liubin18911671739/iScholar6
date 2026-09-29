import { describe, it, expect, vi, beforeEach } from "vitest";

// The ledger now delegates to the backend client; assert the contract.
const appendAudit = vi.fn(async (..._args: unknown[]) => undefined);
const verifyAudit = vi.fn(async (..._args: unknown[]) => ({ valid: true, brokenAt: null, totalEntries: 0 }));

vi.mock("@/lib/client/audit", () => ({
  appendAudit: (...args: unknown[]) => appendAudit(...args),
  verifyAudit: (...args: unknown[]) => verifyAudit(...args),
}));

import { hashContent, writeAuditEntry, verifyAuditChain } from "@/lib/audit/ledger";

describe("hashContent", () => {
  it("returns the first 16 hex chars of a digest", async () => {
    const hash = await hashContent("test content");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(16);
  });
});

describe("writeAuditEntry", () => {
  beforeEach(() => {
    appendAudit.mockClear();
  });

  it("forwards the audit entry to the backend client", async () => {
    await writeAuditEntry({
      projectId: "proj-1",
      action: "agent.run",
      agentRunId: "run-1",
      outputHash: "deadbeef",
      consentId: "consent-1",
    });
    expect(appendAudit).toHaveBeenCalledTimes(1);
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        action: "agent.run",
        agentRunId: "run-1",
        outputHash: "deadbeef",
        consentId: "consent-1",
      })
    );
  });
});

describe("verifyAuditChain", () => {
  beforeEach(() => {
    verifyAudit.mockClear();
  });

  it("delegates verification to the backend client", async () => {
    verifyAudit.mockResolvedValueOnce({ valid: false, brokenAt: "entry-2", totalEntries: 2 });
    await expect(verifyAuditChain("proj-1")).resolves.toEqual({
      valid: false,
      brokenAt: "entry-2",
      totalEntries: 2,
    });
    expect(verifyAudit).toHaveBeenCalledWith("proj-1");
  });
});
