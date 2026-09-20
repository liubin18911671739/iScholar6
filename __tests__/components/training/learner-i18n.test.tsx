import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MvpTraining } from "@/components/training/mvp-training";
import zhCN from "@/messages/zh-CN.json";
import { createTranslator } from "next-intl";

const originalCollaborativeMode = process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
const originalFetch = globalThis.fetch;

vi.mock("@/lib/local/hooks/projects", () => ({
  useLocalProjects: () => ({
    data: [{ id: "project-id", name: "Project" }],
    error: null,
    refetch: () => {},
  }),
}));

vi.mock("@/lib/local/hooks/training", () => ({
  useTrainingTasks: () => ({ data: [], error: null, refetch: () => {} }),
  useTrainingSubmissions: () => ({ data: [], error: null, refetch: () => {} }),
  useEvidenceCards: () => ({ data: [], error: null, refetch: () => {} }),
  createTrainingTask: vi.fn(async () => "task-id"),
  upsertTrainingSubmission: vi.fn(async () => "submission-id"),
  createEvidenceCard: vi.fn(async () => "evidence-id"),
  updateEvidenceCard: vi.fn(async () => undefined),
  recordAiConsent: vi.fn(async () => ({
    id: "c1",
    projectId: "p1",
    externalServices: [],
    redactionConfirmed: true,
    consentedAt: new Date().toISOString(),
    dataCategories: [],
  })),
}));

describe("training learner i18n", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = "true";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/training/me")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: [
              {
                program_id: "11111111-1111-1111-1111-111111111111",
                training_programs: { name: "春季训练营", status: "active" },
              },
            ],
            submissions: [],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/tasks") || url.includes("/progress")) {
        return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    if (originalCollaborativeMode === undefined) {
      delete process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
    } else {
      process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = originalCollaborativeMode;
    }
    globalThis.fetch = originalFetch;
  });

  it("resolves training.learner and training.peer catalog keys", () => {
    const learner = createTranslator({
      locale: "zh-CN",
      messages: zhCN,
      namespace: "training.learner",
    });
    const peer = createTranslator({
      locale: "zh-CN",
      messages: zhCN,
      namespace: "training.peer",
    });
    expect(learner("title")).toBe("AI科研教练训练空间");
    expect(learner("subtitle")).toContain("教练模式");
    expect(learner("enrolledSync", { name: "春季训练营" })).toContain("春季训练营");
    expect(learner("taskList")).toBe("MVP 训练任务");
    expect(learner("openAgent")).toBe("打开对应智能体");
    expect(learner("answerPlaceholder")).toBe("写下你的判断和依据");
    expect(learner("checklistTitle")).toBe("提交前检查");
    expect(learner("stepProgress", { done: 1, total: 4 })).toContain("1");
    expect(learner("status.not_started")).toBe("未开始");

    const tasks = createTranslator({
      locale: "zh-CN",
      messages: zhCN,
      namespace: "training.tasks",
    });
    expect(tasks("research-question.steps.0.title")).toContain("研究对象");
    expect(tasks("research-question.steps.0.placeholder").length).toBeGreaterThan(4);
    expect(peer("title")).toBe("同伴互评");
    expect(peer("hint")).toContain("匿名");
    expect(peer("refresh")).toBe("刷新");
    expect(peer("empty")).toContain("暂无");
  });

  it("renders Chinese learner chrome instead of raw message paths", async () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCN} timeZone="Asia/Shanghai">
        <MvpTraining />
      </NextIntlClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "AI科研教练训练空间"
      );
    });
    expect(screen.getByText("MVP 训练任务")).toBeInTheDocument();
    expect(screen.getAllByText("打开对应智能体").length).toBeGreaterThan(0);
    expect(screen.queryByText("training.learner.title")).not.toBeInTheDocument();
    expect(screen.queryByText("training.learner.taskList")).not.toBeInTheDocument();
    // P0 scaffold / checklist chrome on first task
    await waitFor(() => {
      expect(screen.getByText(/提交前检查|Before you submit/i)).toBeInTheDocument();
    });
  });
});
