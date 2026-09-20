import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RemoteLoadError } from "@/components/collaborative/remote-load-error";
import ProjectsPage from "@/app/(app)/projects/page";

const mockUseLocalProjects = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/local/hooks", () => ({
  useLocalProjects: () => mockUseLocalProjects(),
}));

vi.mock("@/components/projects/wizard-dialog", () => ({
  WizardDialog: () => null,
}));

describe("RemoteLoadError", () => {
  it("renders nothing when there is no error", () => {
    const { container } = render(<RemoteLoadError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an explicit alert and retry action", () => {
    const onRetry = vi.fn();
    render(<RemoteLoadError error="无法从 Supabase 加载「projects」数据" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("无法从 Supabase 加载「projects」数据");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("projects page remote load failure", () => {
  it("shows an explicit error instead of an empty project list", () => {
    mockUseLocalProjects.mockReturnValue({
      data: undefined,
      error: "无法从 Supabase 加载「projects」数据。请检查登录状态、权限或网络连接后重试。",
      refetch: vi.fn(),
    });

    render(<ProjectsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("无法从 Supabase 加载「projects」数据");
    expect(screen.queryByText("noProjects")).not.toBeInTheDocument();
  });
});
