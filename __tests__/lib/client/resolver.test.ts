import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/local/hooks data-backend resolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults research hooks to the legacy implementation", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_BACKEND", "legacy");
    vi.resetModules();

    const resolver = await import("@/lib/local/hooks");
    const legacy = await import("@/lib/local/hooks/index");

    expect(resolver.useLocalProjects).toBe(legacy.useLocalProjects);
    expect(resolver.createProject).toBe(legacy.createProject);
  });

  it("selects the React Query backend hooks when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_BACKEND", "backend");
    vi.resetModules();

    const resolver = await import("@/lib/local/hooks");
    const backend = await import("@/lib/client/hooks");

    expect(resolver.useLocalProjects).toBe(backend.useLocalProjects);
    expect(resolver.createManuscriptBlock).toBe(backend.createManuscriptBlock);
  });

  it("keeps legacy-only exports (cost, training) available in backend mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_BACKEND", "backend");
    vi.resetModules();

    const resolver = await import("@/lib/local/hooks");
    const legacy = await import("@/lib/local/hooks/index");

    expect(resolver.useCostSummary).toBe(legacy.useCostSummary);
    expect(resolver.useTrainingPrograms).toBe(legacy.useTrainingPrograms);
  });
});
