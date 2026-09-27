import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocalProjects } from "@/lib/client/hooks/projects";
import { useLocalManuscripts } from "@/lib/client/hooks/manuscripts";

const originalFetch = globalThis.fetch;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

describe("lib/client/hooks read queries", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: [{ id: "p1", name: "Project", updatedAt: "t" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("exposes project rows through the legacy RemoteListQuery shape", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLocalProjects(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refetch).toBe("function");
  });

  it("skips the request when the scoping id is empty", async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLocalManuscripts(""), { wrapper: Wrapper });

    expect(result.current.data).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
