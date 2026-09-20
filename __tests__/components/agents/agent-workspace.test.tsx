import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AgentWorkspace, type AgentStatus } from "@/components/agents/agent-workspace";

const mockMessages = {
  agents: {
    status: {
      idle: "就绪",
      running: "运行中",
      needsReview: "待审核",
      approved: "已批准",
      applied: "已应用",
      failed: "失败",
    },
    tabs: { input: "输入", workspace: "工作区", output: "输出" },
    configHint: "配置参数后点击运行",
    // Action labels accessed from "agents" namespace by the component
    run: "运行",
    running: "运行中...",
    approve: "批准",
    reject: "驳回",
    applyToManuscript: "应用到论文",
    rerun: "重新运行",
  },
  common: {
    run: "运行",
    running: "运行中...",
    approve: "批准",
    reject: "驳回",
    applyToManuscript: "应用到论文",
    rerun: "重新运行",
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "zh-CN", messages: mockMessages }, ui)
  );
}

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  PlayCircle: () => React.createElement("span", { "data-testid": "icon-play" }),
  Loader2: () => React.createElement("span", { "data-testid": "icon-loader" }),
  CheckCircle2: () => React.createElement("span", { "data-testid": "icon-check" }),
  XCircle: () => React.createElement("span", { "data-testid": "icon-x" }),
  RotateCcw: () => React.createElement("span", { "data-testid": "icon-rerun" }),
  CheckSquare: () => React.createElement("span", { "data-testid": "icon-apply" }),
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value }: { value: number }) =>
    React.createElement("div", { "data-testid": "progress", "data-value": value }),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
    React.createElement("span", { "data-testid": "badge", "data-variant": variant }, children),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  TabsList: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  TabsTrigger: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  TabsContent: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

const baseProps = {
  title: "TestAgent",
  description: "Test description",
  inputs: React.createElement("div", { "data-testid": "inputs" }, "Inputs"),
  workspace: React.createElement("div", { "data-testid": "workspace" }, "Workspace"),
  outputs: React.createElement("div", { "data-testid": "outputs" }, "Outputs"),
};

describe("AgentWorkspace", () => {
  it("renders title and description", () => {
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "idle" }));
    expect(screen.getByText("TestAgent")).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("renders inputs, workspace, and outputs slots", () => {
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "idle" }));
    // Component renders both desktop + mobile layouts, so use getAllByTestId
    expect(screen.getAllByTestId("inputs").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("outputs").length).toBeGreaterThan(0);
  });

  it("shows Run button when status is idle", () => {
    const onRun = vi.fn();
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "idle", onRun }));
    const runButton = screen.getByText("运行");
    expect(runButton).toBeInTheDocument();
    fireEvent.click(runButton);
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("shows spinner when status is running", () => {
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "running", progress: 30 }));
    expect(screen.getByText("运行中...")).toBeInTheDocument();
    expect(screen.getByTestId("progress")).toHaveAttribute("data-value", "30");
  });

  it("shows Approve and Reject buttons when status is needs_review", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "needs_review", onApprove, onReject }));
    fireEvent.click(screen.getByText("批准"));
    expect(onApprove).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("驳回"));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("shows Apply to Manuscript button when status is approved", () => {
    const onApply = vi.fn();
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "approved", onApply }));
    fireEvent.click(screen.getByText("应用到论文"));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("shows Re-run button when status is applied", () => {
    const onRerun = vi.fn();
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "applied", onRerun }));
    fireEvent.click(screen.getByText("重新运行"));
    expect(onRerun).toHaveBeenCalledOnce();
  });

  it("shows Re-run button when status is failed", () => {
    const onRerun = vi.fn();
    renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: "failed", onRerun }));
    fireEvent.click(screen.getByText("重新运行"));
    expect(onRerun).toHaveBeenCalledOnce();
  });

  it("renders badge with correct status label", () => {
    const statusLabels: Record<string, string> = {
      idle: "就绪",
      running: "运行中",
      needs_review: "待审核",
      approved: "已批准",
      applied: "已应用",
      failed: "失败",
    };

    for (const [status, label] of Object.entries(statusLabels)) {
      const { unmount } = renderWithIntl(React.createElement(AgentWorkspace, { ...baseProps, status: status as AgentStatus }));
      // Component renders desktop + mobile, so label appears twice
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });
});
