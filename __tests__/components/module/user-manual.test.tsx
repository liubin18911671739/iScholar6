import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mockManualSections = [
  { title: "Step One", body: "First step body" },
  { title: "Step Two", body: "Second step body" },
];

const mockMessages = {
  module: {
    manualTitle: "User Manual",
    manualStatus: "Current step ready",
    expand: "Expand",
    manualIntro: {
      topic: "Topic intro text.",
    },
    manual: {
      topic: mockManualSections,
    },
  },
} as const;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    React.createElement(NextIntlClientProvider, { locale: "en-US", messages: mockMessages }, ui)
  );
}

vi.mock("lucide-react", () => ({
  BookOpen: ({ className }: any) =>
    React.createElement("span", { "data-testid": "icon-book", className }),
  X: () => React.createElement("span", { "data-testid": "icon-x" }),
  ChevronLeft: ({ className }: any) =>
    React.createElement("span", { "data-testid": "icon-chevron", className }),
  CheckCircle2: ({ className }: any) =>
    React.createElement("span", { "data-testid": "icon-check", className }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, variant, size, className }: any) =>
    React.createElement(
      "button",
      { onClick, "data-variant": variant, "data-size": size, className },
      children
    ),
}));

vi.mock("@/components/module/stages", () => ({
  getStage: () => ({
    accent: {
      text: "text-cyan-300",
      chip: "bg-cyan-500 text-white",
    },
  }),
  primaryStageForAgent: () => 1,
}));

import { UserManual } from "@/components/module/user-manual";

describe("UserManual", () => {
  describe("with showCollapse=true (default)", () => {
    it("renders manual sections from t.raw", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic" })
      );
      expect(screen.getByText("Step One")).toBeInTheDocument();
      expect(screen.getByText("First step body")).toBeInTheDocument();
      expect(screen.getByText("Step Two")).toBeInTheDocument();
      expect(screen.getByText("Second step body")).toBeInTheDocument();
    });

    it("renders the status footer", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic" })
      );
      expect(screen.getByText("Current step ready")).toBeInTheDocument();
    });

    it("renders the intro text", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic" })
      );
      expect(screen.getByText("Topic intro text.")).toBeInTheDocument();
    });

    it("renders numbered sections", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic" })
      );
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("has cosmic-panel className when showCollapse=true", () => {
      const { container } = renderWithIntl(
        React.createElement(UserManual, { agentId: "topic" })
      );
      expect(container.querySelector(".cosmic-panel")).toBeTruthy();
    });
  });

  describe("with showCollapse=false", () => {
    it("renders in always-open mode without cosmic-panel wrapper", () => {
      const { container } = renderWithIntl(
        React.createElement(UserManual, { agentId: "topic", showCollapse: false })
      );
      expect(container.querySelector(".cosmic-panel")).toBeFalsy();
    });

    it("does not render collapse/expand button", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic", showCollapse: false })
      );
      expect(screen.queryByTestId("icon-x")).not.toBeInTheDocument();
    });

    it("still renders all sections", () => {
      renderWithIntl(
        React.createElement(UserManual, { agentId: "topic", showCollapse: false })
      );
      expect(screen.getByText("Step One")).toBeInTheDocument();
      expect(screen.getByText("Step Two")).toBeInTheDocument();
    });
  });
});
