import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockMessages = {
  module: {
    sideManualTooltip: "Usage Guide",
    sideChatTooltip: "Module Assistant",
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "en-US", messages: mockMessages }, ui)
  );
}

vi.mock("lucide-react", () => ({
  HelpCircle: () => React.createElement("span", { "data-testid": "icon-help" }),
  MessageCircle: () => React.createElement("span", { "data-testid": "icon-chat" }),
}));

vi.mock("@/components/ui/tooltip", () => {
  const MockTooltip = ({ children }: any) => React.createElement("div", null, children);
  const MockTooltipContent = ({ children }: any) => React.createElement("div", { "data-testid": "tooltip" }, children);
  const MockTooltipTrigger = ({ children, asChild }: any) =>
    asChild ? children : React.createElement("div", null, children);
  return {
    Tooltip: MockTooltip,
    TooltipContent: MockTooltipContent,
    TooltipTrigger: MockTooltipTrigger,
  };
});

import { SideButtons } from "@/components/module/side-buttons";

describe("SideButtons", () => {
  const defaultProps = {
    manualOpen: false,
    chatOpen: false,
    onToggleManual: vi.fn(),
    onToggleChat: vi.fn(),
  };

  it("renders two buttons", () => {
    renderWithIntl(React.createElement(SideButtons, defaultProps));
    const buttons = screen.getAllByRole("button");
    // Actually tooltip trigger doesn't use role="button". Let's check via aria-labels.
    // The buttons are rendered as <button> elements
    expect(screen.getByLabelText("Usage Guide")).toBeInTheDocument();
    expect(screen.getByLabelText("Module Assistant")).toBeInTheDocument();
  });

  it("calls onToggleManual when help button clicked", () => {
    const onToggleManual = vi.fn();
    renderWithIntl(
      React.createElement(SideButtons, { ...defaultProps, onToggleManual })
    );
    fireEvent.click(screen.getByLabelText("Usage Guide"));
    expect(onToggleManual).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleChat when chat button clicked", () => {
    const onToggleChat = vi.fn();
    renderWithIntl(
      React.createElement(SideButtons, { ...defaultProps, onToggleChat })
    );
    fireEvent.click(screen.getByLabelText("Module Assistant"));
    expect(onToggleChat).toHaveBeenCalledTimes(1);
  });

  it("applies ring style when manualOpen is true", () => {
    renderWithIntl(
      React.createElement(SideButtons, { ...defaultProps, manualOpen: true })
    );
    const helpBtn = screen.getByLabelText("Usage Guide");
    expect(helpBtn.className).toContain("ring-2");
  });

  it("applies ring style when chatOpen is true", () => {
    renderWithIntl(
      React.createElement(SideButtons, { ...defaultProps, chatOpen: true })
    );
    const chatBtn = screen.getByLabelText("Module Assistant");
    expect(chatBtn.className).toContain("ring-2");
  });

  it("does not apply ring when both are closed", () => {
    renderWithIntl(React.createElement(SideButtons, defaultProps));
    const helpBtn = screen.getByLabelText("Usage Guide");
    const chatBtn = screen.getByLabelText("Module Assistant");
    expect(helpBtn.className).not.toContain("ring-2");
    expect(chatBtn.className).not.toContain("ring-2");
  });
});
