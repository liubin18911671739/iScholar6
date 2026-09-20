import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateSupabaseServerClient, mockRequireStaff, mockSupabase, mockStaffAuth } = vi.hoisted(() => {
  const mockStaffAuth = { user: { id: "staff-user" }, role: "librarian", error: null };
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return {
    mockCreateSupabaseServerClient: vi.fn(() => mockSupabase),
    mockRequireStaff: vi.fn(async () => mockStaffAuth),
    mockSupabase,
    mockStaffAuth,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

vi.mock("@/lib/supabase/roles", () => ({
  requireStaff: mockRequireStaff,
  listTaProgramIds: vi.fn(async () => []),
  isProgramTA: vi.fn(async () => false),
  requireStaffOrProgramTA: mockRequireStaff,
  requireReviewerForSubmission: mockRequireStaff,
  isGlobalStaffRole: (role: string) => role === "librarian" || role === "admin",
}));

vi.mock("@/lib/server/training-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/training-access")>(
    "@/lib/server/training-access"
  );
  return {
    ...actual,
    requireReviewerContext: vi.fn(async () => ({
      user: { id: "staff-user" },
      role: "librarian",
      taProgramIds: [],
      isStaff: true,
      error: null,
    })),
    requireReviewerForSubmission: vi.fn(async () => ({
      user: { id: "staff-user" },
      role: "librarian",
      programId: "program-id",
      error: null,
    })),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })), inviteUserByEmail: vi.fn() } },
  })),
}));

import { POST as postMe } from "@/app/api/training/me/route";
import { POST as postPrograms } from "@/app/api/training/programs/route";
import { POST as postMembers } from "@/app/api/training/programs/[programId]/members/route";
import { POST as postReviews } from "@/app/api/training/reviews/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("training API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSupabaseServerClient.mockReturnValue(mockSupabase);
    mockRequireStaff.mockResolvedValue(mockStaffAuth);
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "learner-user" } } });
  });

  it("returns field-level validation errors for invalid learner submissions", async () => {
    const res = await postMe(jsonRequest({ programId: "not-a-uuid", taskId: "bad task", answers: [], status: "done" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues.map((issue: { path: string }) => issue.path)).toEqual(
      expect.arrayContaining(["programId", "taskId", "answers", "status"])
    );
  });

  it("returns field-level validation errors for invalid program creation", async () => {
    const res = await postPrograms(jsonRequest({ name: "", description: "x".repeat(2_001) }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues.map((issue: { path: string }) => issue.path)).toEqual(
      expect.arrayContaining(["name", "description"])
    );
  });

  it("rejects program date ranges where endDate is before startDate", async () => {
    const res = await postPrograms(
      jsonRequest({
        name: "Camp",
        startDate: "2026-06-01",
        endDate: "2026-05-01",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues.map((issue: { path: string }) => issue.path)).toContain("endDate");
  });

  it("returns field-level validation errors for invalid member invites", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
    const res = await postMembers(jsonRequest({ email: "not-email" }), { params: { programId: "program-id" } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues[0].path).toBe("email");
  });

  it("returns field-level validation errors for invalid reviews", async () => {
    const res = await postReviews(jsonRequest({ submissionId: "not-a-uuid", decision: "approved", score: 101 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
    expect(json.issues.map((issue: { path: string }) => issue.path)).toEqual(
      expect.arrayContaining(["submissionId", "score"])
    );
  });

  it("returns field-level validation errors for invalid claim payload", async () => {
    const res = await postReviews(jsonRequest({ submissionId: "bad", claim: "yes" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("VALIDATION_ERROR");
  });
});
