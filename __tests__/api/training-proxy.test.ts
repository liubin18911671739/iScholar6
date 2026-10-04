import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/backend", () => ({
  backendIdentityHeaders: vi.fn(async () => ({ "X-IScholar-User": "u1" })),
  backendUrl: (path: string) => `http://backend:8000${path}`,
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/training/[...path]/route";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

function request(method: string, body?: string) {
  return new Request("http://localhost/api/training/test", {
    method,
    headers: { "content-type": "application/json" },
    body,
  }) as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  globalThis.fetch = mockFetch;
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("training BFF proxy", () => {
  it("maps /api/training to /v1/training and signs the identity", async () => {
    const response = await GET(request("GET"), { params: { path: ["programs"] } });
    expect(response.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("http://backend:8000/v1/training/programs");
    expect(init.headers.get("X-IScholar-User")).toBe("u1");
  });

  it("forwards nested paths and POST bodies", async () => {
    const response = await POST(request("POST", JSON.stringify({ email: "x" })), {
      params: { path: ["programs", "abc", "members"] },
    });
    expect(response.status).toBe(200);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe("http://backend:8000/v1/training/programs/abc/members");
    expect(init.method).toBe("POST");
    expect(init.body).toBeTruthy();
  });

  it("supports PATCH and DELETE", async () => {
    await PATCH(request("PATCH", "{}"), { params: { path: ["enrollments", "1"] } });
    expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
    await DELETE(request("DELETE"), { params: { path: ["organizations", "2", "members", "3"] } });
    expect(mockFetch.mock.calls[1][1].method).toBe("DELETE");
  });

  it("passes query strings through", async () => {
    const req = new Request("http://localhost/api/training/reviews?programId=abc", { method: "GET" }) as unknown as Parameters<
      typeof GET
    >[0];
    (req as unknown as { nextUrl: URL }).nextUrl = new URL("http://localhost/api/training/reviews?programId=abc");
    await GET(req, { params: { path: ["reviews"] } });
    expect(String(mockFetch.mock.calls[0][0])).toBe("http://backend:8000/v1/training/reviews?programId=abc");
  });

  it("rejects path traversal", async () => {
    const response = await GET(request("GET"), { params: { path: ["..", "me"] } });
    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
