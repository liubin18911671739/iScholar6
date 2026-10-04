import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(async () => ({
    "X-IScholar-User": "user-1",
    "X-IScholar-Timestamp": "1",
    "X-IScholar-Signature": "sig",
  })),
}));

vi.mock("@/lib/server/backend", () => ({
  backendIdentityHeaders: mocks.headers,
  backendUrl: (path: string) => `http://backend.test${path}`,
}));

import { POST as postMcp } from "@/app/api/mcp/[tool]/route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as any;
}

function invalidJsonRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{",
  }) as any;
}

describe("MCP route security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.headers.mockResolvedValueOnce(null as never);
    const res = await postMcp(request({}), { params: { tool: "openalex_search" } });
    expect(res.status).toBe(401);
  });

  it("reshapes the legacy body into the backend contract", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await postMcp(
      request({ projectId: "p1", consentProof: { consentId: "c1" }, query: "AI research", perPage: 5 }),
      { params: { tool: "openalex_search" } }
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://backend.test/v1/mcp/tools/openalex_search");
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "p1",
      consentProof: { consentId: "c1" },
      params: { query: "AI research", perPage: 5 },
    });
  });

  it("rejects malformed payloads", async () => {
    const res = await postMcp(invalidJsonRequest(), { params: { tool: "openalex_search" } });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_JSON");
  });
});
