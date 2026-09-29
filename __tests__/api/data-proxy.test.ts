import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/backend", () => ({
  backendIdentityHeaders: vi.fn(async () => ({ "X-IScholar-User": "u1" })),
  backendUrl: (path: string) => `http://backend:8000${path}`,
}));

import { DELETE as dataDELETE, GET as dataGET, PATCH as dataPATCH } from "@/app/api/data/[...path]/route";
import { backendIdentityHeaders } from "@/lib/server/backend";
import { proxyToBackend } from "@/lib/server/backend-proxy";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

function request(method: string, body?: string) {
  return new Request("http://localhost/api/data/test", {
    method,
    headers: { "content-type": "application/json" },
    body,
  }) as unknown as Parameters<typeof dataGET>[0];
}

beforeEach(() => {
  globalThis.fetch = mockFetch;
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, data: [] }), {
      status: 200,
      headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="a.bin"' },
    })
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("data BFF proxy", () => {
  it("maps /api/data to /v1/data and forwards the method + body", async () => {
    const response = await dataPATCH(request("PATCH", JSON.stringify({ name: "x" })), {
      params: { path: ["projects", "abc"] },
    });
    expect(response.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("http://backend:8000/v1/data/projects/abc");
    expect(init.method).toBe("PATCH");
    expect(init.headers.get("X-IScholar-User")).toBe("u1");
  });

  it("passes download headers through", async () => {
    const response = await dataGET(request("GET"), { params: { path: ["attachments", "1", "download"] } });
    expect(response.headers.get("content-disposition")).toContain("a.bin");
  });

  it("supports DELETE", async () => {
    await dataDELETE(request("DELETE"), { params: { path: ["tasks", "1"] } });
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it("rejects path traversal", async () => {
    const response = await dataGET(request("GET"), { params: { path: ["..", "healthz"] } });
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a non-allowlisted root", async () => {
    const response = await proxyToBackend(request("GET") as never, ["evil"]);
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a decoded traversal segment", async () => {
    const response = await proxyToBackend(request("GET") as never, ["data", "..%2F..%2Fmetrics"]);
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects an unsigned caller", async () => {
    vi.mocked(backendIdentityHeaders).mockResolvedValueOnce(null);
    const response = await proxyToBackend(request("GET") as never, ["data", "projects"]);
    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
