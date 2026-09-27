import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/client/data";

const originalFetch = globalThis.fetch;

function mockJson(payload: unknown, status = 200) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })
  );
}

describe("lib/client/data BFF client", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("unwraps the { ok, data } envelope", async () => {
    mockJson({ ok: true, data: [{ id: "p1", name: "Project" }] });

    await expect(api.listProjects()).resolves.toEqual([{ id: "p1", name: "Project" }]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/data/projects",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("throws BackendApiError with the backend error code", async () => {
    mockJson({ ok: false, error: "PROJECT_NOT_FOUND" }, 404);

    await expect(api.getProject("missing")).rejects.toMatchObject({
      name: "BackendApiError",
      status: 404,
      code: "PROJECT_NOT_FOUND",
    });
  });

  it("builds camelCase query strings for scoped lists", async () => {
    mockJson({ ok: true, data: [] });

    await api.listManuscripts("abc 123");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/data/manuscripts?projectId=abc+123",
      expect.anything()
    );
  });

  it("sends JSON bodies with content-type for mutations", async () => {
    mockJson({ ok: true, data: { id: "t1" } });

    await api.createTask({ projectId: "p1", title: "Do it" });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ projectId: "p1", title: "Do it", status: "pending", createdBy: "human" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("uploads attachments as multipart without forcing JSON content-type", async () => {
    mockJson({ ok: true, data: { id: "a1" } }, 201);

    await api.createAttachment({
      projectId: "p1",
      filename: "paper.pdf",
      data: new Blob(["bytes"], { type: "application/pdf" }),
      mimeType: "application/pdf",
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("projectId")).toBe("p1");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("does not hit the network when listing versions without a scope", async () => {
    await expect(api.listVersions({})).resolves.toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
