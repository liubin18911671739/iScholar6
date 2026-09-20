import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the agent prompts
vi.mock("@/lib/ai/prompts", () => ({
  TOPIC_SCOUT_PROMPT: "Topic scout system prompt",
  LIT_REVIEW_PROMPT: "Lit review system prompt",
  DESIGN_PROMPT: "Design system prompt",
  DATA_PILOT_PROMPT: "Data pilot system prompt",
  IMRAD_WRITER_PROMPT: "IMRaD writer system prompt",
  SUBMIT_MATCH_PROMPT: "Submit match system prompt",
  REBUTTAL_PROMPT: "Rebuttal system prompt",
}));

// Mock fetch globally
const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch;
  vi.clearAllMocks();
  // Set required env var
  process.env.DEEPSEEK_API_KEY = "sk-test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DEEPSEEK_API_KEY;
});

import { POST } from "@/app/api/hermes/chat/route";

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/hermes/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/hermes/chat", () => {
  describe("input validation", () => {
    it("returns 400 for missing agentId", async () => {
      const res = await POST(buildRequest({ messages: [{ role: "user", content: "hello" }] }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it("returns 400 for invalid agentId", async () => {
      const res = await POST(
        buildRequest({ agentId: "invalid", messages: [{ role: "user", content: "hello" }] })
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it("returns 400 for missing messages", async () => {
      const res = await POST(buildRequest({ agentId: "topic" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it("returns 400 for empty messages array", async () => {
      const res = await POST(buildRequest({ agentId: "topic", messages: [] }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });

    it("returns 400 for non-array messages", async () => {
      const res = await POST(
        buildRequest({ agentId: "topic", messages: "not-an-array" })
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);
    });
  });

  describe("valid requests", () => {
    it("accepts valid agentId for all 7 agents", async () => {
      const agents = ["topic", "litreview", "design", "data", "write", "submit", "rebuttal"];

      // Mock a successful stream response
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
              })
              .mockResolvedValueOnce({
                done: true,
                value: undefined,
              }),
          }),
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      for (const agent of agents) {
        const res = await POST(
          buildRequest({ agentId: agent, messages: [{ role: "user", content: "hi" }] })
        );
        expect(res.status).toBe(200);
      }
    });

    it("includes system prompt with agent expertise", async () => {
      let capturedBody: string | null = null;
      mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: true, value: undefined }),
            }),
          },
        };
      });

      await POST(
        buildRequest({ agentId: "litreview", messages: [{ role: "user", content: "help" }] })
      );

      const parsed = JSON.parse(capturedBody!);
      const systemMsg = parsed.messages[0];
      expect(systemMsg.role).toBe("system");
      expect(systemMsg.content).toContain("LitReview");
      expect(systemMsg.content).toContain("Lit review system prompt");
      expect(systemMsg.content).toContain("conversational assistant mode");
    });

    it("sets stream:true in DeepSeek request", async () => {
      let capturedBody: string | null = null;
      mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: true, value: undefined }),
            }),
          },
        };
      });

      await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );

      const parsed = JSON.parse(capturedBody!);
      expect(parsed.stream).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns 401 with helpful message when DeepSeek returns 401", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const res = await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Invalid API key");
    });

    it("returns 429 when DeepSeek rate limits", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests",
      });

      const res = await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );
      const json = await res.json();

      expect(res.status).toBe(429);
      expect(json.error).toContain("Rate limited");
    });

    it("returns upstream status for other DeepSeek errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Server Error",
      });

      const res = await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );
      expect(res.status).toBe(500);
    });
  });

  describe("streaming", () => {
    it("streams chunks from DeepSeek response", async () => {
      const chunks = ["Hello", " ", "World"];
      let readCount = 0;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(() => {
              if (readCount < chunks.length) {
                const chunk = `data: {"choices":[{"delta":{"content":"${chunks[readCount]}"}}]}\n\n`;
                readCount++;
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(chunk),
                });
              }
              return Promise.resolve({ done: true, value: undefined });
            }),
          }),
        },
      });

      const res = await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value, { stream: true });
        }
      }

      expect(fullContent).toBe("Hello World");
    });

    it("skips malformed SSE chunks gracefully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("garbage\n\n"),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"valid"}}]}\n\n'
                ),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      });

      const res = await POST(
        buildRequest({ agentId: "topic", messages: [{ role: "user", content: "hi" }] })
      );

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          content += decoder.decode(value, { stream: true });
        }
      }

      expect(content).toBe("valid");
    });
  });
});
