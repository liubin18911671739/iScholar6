import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const citationMockMessages = {
  citations: {
    filter: "筛选引用文献...",
    totalCount: "项目中共{count}条引用文献",
    noMatch: "没有匹配的引用文献",
    orSelect: "或从文献库中选择：",
  },
  common: {
    insert: "插入",
    cancel: "取消",
    noData: "未解析到结构化数据。结果在工作区中。",
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "zh-CN", messages: citationMockMessages }, ui)
  );
}

const { mockDeleteBibItem } = vi.hoisted(() => ({
  mockDeleteBibItem: vi.fn(),
}));

const mockBibItems = [
  {
    id: "bib-1",
    title: "Machine Learning in Education",
    authors: ["Smith, J.", "Doe, A."],
    year: 2024,
    venue: "Nature Education",
    doi: "10.1234/test",
  },
  {
    id: "bib-2",
    title: "Deep Learning for NLP",
    authors: ["Lee, K."],
    year: 2023,
    venue: "ACL",
  },
];

vi.mock("@/lib/local/hooks", () => ({
  useLocalBibItems: () => ({ data: mockBibItems, error: null, refetch: () => {} }),
  deleteBibItem: mockDeleteBibItem,
}));

vi.mock("lucide-react", () => ({
  Search: () => React.createElement("span", { "data-testid": "icon-search" }),
  Trash2: () => React.createElement("span", { "data-testid": "icon-trash" }),
  FileText: () => React.createElement("span", { "data-testid": "icon-file" }),
  Quote: () => React.createElement("span", { "data-testid": "icon-quote" }),
  ExternalLink: () => React.createElement("span", { "data-testid": "icon-extlink" }),
  BookOpen: () => React.createElement("span", { "data-testid": "icon-book" }),
  AlertCircle: () => React.createElement("span", { "data-testid": "icon-alert" }),
  RefreshCw: () => React.createElement("span", { "data-testid": "icon-refresh" }),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) =>
    React.createElement("input", {
      "data-testid": "filter-input",
      value: props.value,
      onChange: props.onChange,
      placeholder: props.placeholder,
    }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) =>
    React.createElement("button", { onClick, ...props }, children),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => React.createElement("div", null, children),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => React.createElement("span", null, children),
}));

import { CitationList } from "@/components/citations/citation-list";

describe("CitationList", () => {
  it("renders citation items with title", () => {
    renderWithIntl(React.createElement(CitationList, { projectId: "proj-1" }));
    expect(screen.getByText("Machine Learning in Education")).toBeInTheDocument();
    expect(screen.getByText("Deep Learning for NLP")).toBeInTheDocument();
  });

  it("renders filter input", () => {
    renderWithIntl(React.createElement(CitationList, { projectId: "proj-1" }));
    expect(screen.getByTestId("filter-input")).toBeInTheDocument();
  });

  it("filters citations by title", () => {
    renderWithIntl(React.createElement(CitationList, { projectId: "proj-1" }));
    const input = screen.getByTestId("filter-input");
    fireEvent.change(input, { target: { value: "Machine" } });
    expect(screen.getByText("Machine Learning in Education")).toBeInTheDocument();
    expect(screen.queryByText("Deep Learning for NLP")).not.toBeInTheDocument();
  });
});
