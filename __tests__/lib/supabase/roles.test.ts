import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isGlobalStaffRole,
  isProgramTA,
  listTaProgramIds,
  requireReviewerForSubmission,
  requireStaff,
  requireStaffOrProgramTA,
} from "@/lib/supabase/roles";
import { requireReviewerContext } from "@/lib/server/training-access";

function chainResult<T>(result: { data: T; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.order = vi.fn(self);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = undefined;
  // Terminal await on builder used by listTaProgramIds (.select without single)
  Object.assign(chain, {
    // Make the chain thenable so `await client.from(...).select(...)` works
    then(onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  });
  return chain;
}

describe("isGlobalStaffRole", () => {
  it("accepts librarian and admin only", () => {
    expect(isGlobalStaffRole("librarian")).toBe(true);
    expect(isGlobalStaffRole("admin")).toBe(true);
    expect(isGlobalStaffRole("learner")).toBe(false);
    expect(isGlobalStaffRole("ta")).toBe(false);
    expect(isGlobalStaffRole(null)).toBe(false);
  });
});

describe("requireStaff", () => {
  it("returns UNAUTHENTICATED when no user", async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: vi.fn(),
    } as any;
    const result = await requireStaff(client);
    expect(result).toEqual({ user: null, role: null, error: "UNAUTHENTICATED" });
  });

  it("returns FORBIDDEN for non-staff profile", async () => {
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })) },
      from: vi.fn(() => chainResult({ data: { role: "learner" }, error: null })),
    } as any;
    const result = await requireStaff(client);
    expect(result.error).toBe("FORBIDDEN");
  });

  it("returns staff auth for librarian", async () => {
    const user = { id: "staff-1" };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: vi.fn(() => chainResult({ data: { role: "librarian" }, error: null })),
    } as any;
    const result = await requireStaff(client);
    expect(result.error).toBeNull();
    expect(result.role).toBe("librarian");
    expect(result.user).toEqual(user);
  });
});

describe("listTaProgramIds / isProgramTA", () => {
  it("lists active ta enrollments", async () => {
    const client = {
      from: vi.fn(() =>
        chainResult({
          data: [{ program_id: "p1" }, { program_id: "p2" }],
          error: null,
        })
      ),
    } as any;
    const ids = await listTaProgramIds(client, "user-ta");
    expect(ids).toEqual(["p1", "p2"]);
    expect(client.from).toHaveBeenCalledWith("training_enrollments");
  });

  it("returns empty on error", async () => {
    const client = {
      from: vi.fn(() => chainResult({ data: null, error: { message: "x" } })),
    } as any;
    expect(await listTaProgramIds(client, "u")).toEqual([]);
  });

  it("isProgramTA true when enrollment exists", async () => {
    const client = {
      from: vi.fn(() => chainResult({ data: { id: "enr-1" }, error: null })),
    } as any;
    expect(await isProgramTA(client, "u", "prog")).toBe(true);
  });

  it("isProgramTA false when missing", async () => {
    const client = {
      from: vi.fn(() => chainResult({ data: null, error: null })),
    } as any;
    expect(await isProgramTA(client, "u", "prog")).toBe(false);
  });
});

describe("requireStaffOrProgramTA", () => {
  it("prefers global admin for any program", async () => {
    const user = { id: "staff" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "admin" }, error: null });
      }
      if (table === "training_programs") {
        return chainResult({ data: { id: "camp-1", organization_id: "org-1" }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireStaffOrProgramTA(client, "camp-1");
    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.role).toBe("admin");
      expect(result.programId).toBe("camp-1");
    }
  });

  it("allows librarian when org member of program org", async () => {
    const user = { id: "lib" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "librarian" }, error: null });
      }
      if (table === "training_programs") {
        return chainResult({ data: { id: "camp-1", organization_id: "org-a" }, error: null });
      }
      if (table === "organization_members") {
        return chainResult({ data: { org_id: "org-a" }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireStaffOrProgramTA(client, "camp-1");
    expect(result.error).toBeNull();
    if (!result.error) expect(result.role).toBe("librarian");
  });

  it("allows active camp TA", async () => {
    const user = { id: "ta-user" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "learner" }, error: null });
      }
      if (table === "training_enrollments") {
        return chainResult({ data: { id: "enr" }, error: null });
      }
      if (table === "training_programs") {
        return chainResult({ data: null, error: null });
      }
      return chainResult({ data: null, error: null });
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireStaffOrProgramTA(client, "camp-2");
    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.role).toBe("ta");
      expect(result.programId).toBe("camp-2");
    }
  });

  it("forbids plain learners not enrolled as TA", async () => {
    const user = { id: "learner" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "learner" }, error: null });
      }
      return chainResult({ data: null, error: null });
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireStaffOrProgramTA(client, "camp-x");
    expect(result.error).toBe("FORBIDDEN");
  });
});

describe("listStaffOrgIds", () => {
  it("returns all for admin", async () => {
    const { listStaffOrgIds } = await import("@/lib/supabase/roles");
    const client = {
      from: vi.fn(() => chainResult({ data: { role: "admin" }, error: null })),
    } as any;
    expect(await listStaffOrgIds(client, "u1", "admin")).toBe("all");
  });

  it("returns memberships for librarian", async () => {
    const { listStaffOrgIds } = await import("@/lib/supabase/roles");
    const client = {
      from: vi.fn((table: string) => {
        if (table === "organization_members") {
          return chainResult({
            data: [{ org_id: "o1" }, { org_id: "o2" }],
            error: null,
          });
        }
        return chainResult({ data: { role: "librarian" }, error: null });
      }),
    } as any;
    expect(await listStaffOrgIds(client, "u1", "librarian")).toEqual(["o1", "o2"]);
  });
});

describe("requireReviewerForSubmission", () => {
  it("resolves program from submission then staff/TA check", async () => {
    const user = { id: "ta" };
    const from = vi.fn((table: string) => {
      if (table === "training_submissions") {
        return chainResult({ data: { id: "sub-1", program_id: "camp-9" }, error: null });
      }
      if (table === "profiles") {
        return chainResult({ data: { role: "learner" }, error: null });
      }
      if (table === "training_enrollments") {
        return chainResult({ data: { id: "enr" }, error: null });
      }
      throw new Error(table);
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireReviewerForSubmission(client, "sub-1");
    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.role).toBe("ta");
      expect(result.programId).toBe("camp-9");
    }
  });

  it("forbids when submission missing", async () => {
    const user = { id: "u" };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: vi.fn(() => chainResult({ data: null, error: null })),
    } as any;
    const result = await requireReviewerForSubmission(client, "missing");
    expect(result.error).toBe("FORBIDDEN");
  });
});

describe("requireReviewerContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns staff with empty taProgramIds", async () => {
    const user = { id: "lib" };
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: vi.fn(() => chainResult({ data: { role: "librarian" }, error: null })),
    } as any;
    const result = await requireReviewerContext(client);
    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.isStaff).toBe(true);
      expect(result.taProgramIds).toEqual([]);
      expect(result.role).toBe("librarian");
    }
  });

  it("returns ta with program scope", async () => {
    const user = { id: "ta" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "learner" }, error: null });
      }
      if (table === "training_enrollments") {
        return chainResult({
          data: [{ program_id: "a" }, { program_id: "b" }],
          error: null,
        });
      }
      throw new Error(table);
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireReviewerContext(client);
    expect(result.error).toBeNull();
    if (!result.error) {
      expect(result.isStaff).toBe(false);
      expect(result.role).toBe("ta");
      expect(result.taProgramIds).toEqual(["a", "b"]);
    }
  });

  it("forbids users who are neither staff nor TA", async () => {
    const user = { id: "nobody" };
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return chainResult({ data: { role: "learner" }, error: null });
      }
      return chainResult({ data: [], error: null });
    });
    const client = {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as any;
    const result = await requireReviewerContext(client);
    expect(result.error).toBe("FORBIDDEN");
  });
});
