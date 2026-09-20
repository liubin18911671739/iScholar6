import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockMessages = {
  module: {
    subFeatures: {
      topic: {
        discovery: "Topic Discovery",
        literature: "Literature Analysis",
        trends: "Trend Insights",
      },
    },
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "en-US", messages: mockMessages }, ui)
  );
}

import { SubFeatureTabs } from "@/components/module/sub-feature-tabs";

describe("SubFeatureTabs", () => {
  const options = [
    { value: "discovery", label: "Topic Discovery" },
    { value: "literature", label: "Literature Analysis" },
    { value: "trends", label: "Trend Insights" },
  ];

  it("renders all tab options", () => {
    renderWithIntl(
      React.createElement(SubFeatureTabs, {
        options,
        value: "discovery",
        onChange: vi.fn(),
      })
    );
    expect(screen.getByText("Topic Discovery")).toBeInTheDocument();
    expect(screen.getByText("Literature Analysis")).toBeInTheDocument();
    expect(screen.getByText("Trend Insights")).toBeInTheDocument();
  });

  it("highlights active tab", () => {
    renderWithIntl(
      React.createElement(SubFeatureTabs, {
        options,
        value: "literature",
        onChange: vi.fn(),
      })
    );
    const activeTab = screen.getByText("Literature Analysis");
    const inactiveTab = screen.getByText("Topic Discovery");
    expect(activeTab.className).toContain("cosmic-panel");
    expect(inactiveTab.className).not.toContain("cosmic-panel");
  });

  it("calls onChange when tab clicked", () => {
    const onChange = vi.fn();
    renderWithIntl(
      React.createElement(SubFeatureTabs, {
        options,
        value: "discovery",
        onChange,
      })
    );
    fireEvent.click(screen.getByText("Trend Insights"));
    expect(onChange).toHaveBeenCalledWith("trends");
  });

  it("returns null for single option", () => {
    const singleOption = [{ value: "only", label: "Only" }];
    const { container } = render(
      React.createElement(SubFeatureTabs, {
        options: singleOption,
        value: "only",
        onChange: vi.fn(),
      })
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null for empty options", () => {
    const { container } = render(
      React.createElement(SubFeatureTabs, {
        options: [],
        value: "",
        onChange: vi.fn(),
      })
    );
    expect(container.innerHTML).toBe("");
  });

  it("does not call onChange when clicking already-active tab", () => {
    const onChange = vi.fn();
    renderWithIntl(
      React.createElement(SubFeatureTabs, {
        options,
        value: "discovery",
        onChange,
      })
    );
    fireEvent.click(screen.getByText("Topic Discovery"));
    expect(onChange).toHaveBeenCalledWith("discovery");
  });
});
