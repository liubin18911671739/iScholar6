import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MvpTraining } from "@/components/training/mvp-training";
import { ReviewQueue } from "@/components/training/review-queue";
import TrainingManagePage from "@/app/(app)/training/manage/page";
import zhCN from "@/messages/zh-CN.json";

const originalCollaborativeMode = process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
const originalFetch = globalThis.fetch;

const mockProjectsQuery = {
  data: [{ id: "project-id", name: "Project" }],
  error: null,
  refetch: () => {},
};
const mockEmptyList = { data: [] as unknown[], error: null, refetch: () => {} };

vi.mock("@/lib/local/hooks/projects", () => ({
  useLocalProjects: () => mockProjectsQuery,
}));

vi.mock("@/lib/local/hooks/training", () => ({
  useTrainingTasks: () => mockEmptyList,
  useTrainingSubmissions: () => mockEmptyList,
  useEvidenceCards: () => mockEmptyList,
  createTrainingTask: vi.fn(async () => "task-id"),
  upsertTrainingSubmission: vi.fn(async () => "submission-id"),
  createEvidenceCard: vi.fn(async () => "evidence-id"),
  updateEvidenceCard: vi.fn(async () => undefined),
  createTrainingReview: vi.fn(async () => "review-id"),
  recordAiConsent: vi.fn(async () => ({
    id: "c1",
    projectId: "p1",
    externalServices: [],
    redactionConfirmed: true,
    consentedAt: new Date().toISOString(),
    dataCategories: [],
  })),
}));

vi.mock("@/lib/local/hooks", () => ({
  useLocalProjects: () => mockProjectsQuery,
  useTrainingTasks: () => mockEmptyList,
  useTrainingSubmissions: () => mockEmptyList,
  useEvidenceCards: () => mockEmptyList,
  useReviewQueue: () => ({ data: [], error: null, refetch: () => {} }),
  useTrainingPrograms: () => ({ data: [], error: null, refetch: () => {} }),
  useTrainingEnrollments: () => ({ data: [], error: null, refetch: () => {} }),
  useTrainingClassReport: () => ({ data: { memberCount: 0 }, error: null, refetch: () => {} }),
  createTrainingTask: vi.fn(async () => "task-id"),
  upsertTrainingSubmission: vi.fn(async () => "submission-id"),
  createEvidenceCard: vi.fn(async () => "evidence-id"),
  updateEvidenceCard: vi.fn(async () => undefined),
  createTrainingReview: vi.fn(async () => "review-id"),
  createTrainingProgram: vi.fn(async () => "program-id"),
  enrollLearner: vi.fn(async () => "enrollment-id"),
  recordAiConsent: vi.fn(async () => ({
    id: "c1",
    projectId: "p1",
    externalServices: [],
    redactionConfirmed: true,
    consentedAt: new Date().toISOString(),
    dataCategories: [],
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="zh-CN" messages={zhCN}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("collaborative training remote errors", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = "true";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "LOAD_FAILED" }), { status: 500 })
    ) as typeof fetch;
  });

  afterEach(() => {
    if (originalCollaborativeMode === undefined) {
      delete process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
    } else {
      process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = originalCollaborativeMode;
    }
    globalThis.fetch = originalFetch;
  });

  it("shows an explicit enrollment load error in the learner training page", async () => {
    renderWithIntl(<MvpTraining />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("无法读取 Supabase 协作报名");
    });
  });

  it("shows an explicit review queue load error", async () => {
    renderWithIntl(<ReviewQueue />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("无法读取 Supabase 审核队列");
    });
  });

  it("shows an explicit program load error in training management", async () => {
    renderWithIntl(<TrainingManagePage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("无法读取 Supabase 协作训练营");
    });
  });

  it("shows forbidden page when manage programs returns 403", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), { status: 403 })
    ) as typeof fetch;

    renderWithIntl(<TrainingManagePage />);

    await waitFor(() => {
      expect(screen.getByText(/馆员|管理员|助教|无法访问/)).toBeInTheDocument();
    });
  });
});
