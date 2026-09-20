import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const topbarMockMessages = {
  topbar: {
    localMode: "本地",
    localUser: "本地用户",
    browserOnly: "仅浏览器存储",
    lock: "锁定",
  },
  nav: {
    dashboard: "仪表盘",
    projects: "项目",
    settings: "设置",
    selectProject: "选择项目",
    topic: "选题",
    litreview: "文献",
    design: "设计",
    data: "数据",
    write: "撰写",
    submit: "投稿",
    rebuttal: "回复",
  },
  common: {
    cancel: "取消",
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "zh-CN", messages: topbarMockMessages }, ui)
  );
}

const { mockPush, mockLogout } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/projects/test-proj/topic",
}));

vi.mock("@/lib/local/auth", () => ({
  logout: mockLogout,
  isAuthenticated: () => true,
}));

vi.mock("lucide-react", () => ({
  Menu: () => React.createElement("span", { "data-testid": "icon-menu" }),
  User: () => React.createElement("span", { "data-testid": "icon-user" }),
  Lock: () => React.createElement("span", { "data-testid": "icon-lock" }),
  Settings: () => React.createElement("span", { "data-testid": "icon-settings" }),
  ChevronDown: () => React.createElement("span", { "data-testid": "icon-chevron" }),
  LogOut: () => React.createElement("span", { "data-testid": "icon-logout" }),
  Globe: () => React.createElement("span", { "data-testid": "icon-globe" }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => React.createElement("div", null, children),
  DropdownMenuTrigger: ({ children, asChild }: any) => React.createElement("div", null, children),
  DropdownMenuContent: ({ children }: any) => React.createElement("div", null, children),
  DropdownMenuItem: ({ children, onClick }: any) =>
    React.createElement("div", { onClick }, children),
  DropdownMenuSeparator: () => React.createElement("hr"),
  DropdownMenuLabel: ({ children }: any) => React.createElement("div", null, children),
}));

vi.mock("@/lib/stores", () => ({
  useAppStore: (selector: any) => {
    const state = { theme: "dark", setTheme: vi.fn(), _version: 1 };
    return selector ? selector(state) : state;
  },
}));

import { TopBar } from "@/components/layouts/top-bar";

describe("TopBar", () => {
  it("renders the Local indicator", () => {
    renderWithIntl(React.createElement(TopBar));
    expect(screen.getByText("本地")).toBeInTheDocument();
  });

  it("calls onMenuToggle when menu button is clicked", () => {
    const onMenuToggle = vi.fn();
    renderWithIntl(React.createElement(TopBar, { onMenuToggle }));
    const menuButtons = screen.getAllByRole("button");
    fireEvent.click(menuButtons[0]);
    expect(onMenuToggle).toHaveBeenCalled();
  });
});
