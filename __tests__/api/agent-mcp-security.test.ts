import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST as postAgent } from "@/app/api/agents/[agent]/route";
import { POST as postMcp } from "@/app/api/mcp/[tool]/route";

const originalCollaborativeMode = process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

describe("Agent and MCP route security", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = "false";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (originalCollaborativeMode === undefined) delete process.env.NEXT_PUBLIC_COLLABORATIVE_MODE;
    else process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = originalCollaborativeMode;
    if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated Agent requests in collaborative mode", async () => {
    process.env.NEXT_PUBLIC_COLLABORATIVE_MODE = "true";

    const res = await postAgent(request({}), { params: { agent: "topic" } });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("UNAUTHENTICATED");
  });

  it("rejects oversized Agent requests before parsing", async () => {
    const res = await postAgent(request({}, { "content-length": "262145" }), { params: { agent: "topic" } });
    const json = await res.json();

    expect(res.status).toBe(413);
    expect(json.error).toBe("REQUEST_TOO_LARGE");
  });

  it("rejects malformed Agent payloads", async () => {
    const res = await postAgent(invalidJsonRequest(), { params: { agent: "topic" } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_JSON");
  });

  it("rejects Agent requests missing consent proof", async () => {
    const res = await postAgent(
      request({ projectId: "project-id", systemPrompt: "system", userPrompt: "user" }),
      { params: { agent: "topic" } }
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
  });

  it("rate limits repeated Agent requests", async () => {
    const headers = { "x-forwarded-for": "agent-rate-limit-test" };
    for (let index = 0; index < 20; index += 1) {
      const res = await postAgent(request({}, headers), { params: { agent: "unknown-agent" } });
      expect(res.status).toBe(400);
    }

    const limited = await postAgent(request({}, headers), { params: { agent: "unknown-agent" } });
    expect(limited.status).toBe(429);
  });

  it("MCP proxy rejects unauthenticated requests", async () => {
    mocks.headers.mockResolvedValueOnce(null as never);
    const res = await postMcp(request({}), { params: { tool: "openalex_search" } });
    expect(res.status).toBe(401);
  });

  it("MCP proxy reshapes the legacy body into the backend contract", async () => {
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

  it("MCP proxy rejects malformed payloads", async () => {
    const res = await postMcp(invalidJsonRequest(), { params: { tool: "openalex_search" } });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_JSON");
  });
});
