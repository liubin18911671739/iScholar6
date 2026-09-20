import { describe, expect, it, vi } from "vitest";
import {
  buildClientAssertion,
  scoresEndpoint,
  pushGradebookToAgs,
  maskSecret,
} from "@/lib/lms/lti/ags";

describe("LTI AGS helpers", () => {
  it("builds HS256 client assertion JWT with 3 segments", () => {
    const jwt = buildClientAssertion({
      clientId: "dev-key-1",
      tokenUrl: "https://canvas.example.edu/login/oauth2/token",
      clientSecret: "super-secret",
      now: 1_700_000_000_000,
    });
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(10);
    expect(parts[2].length).toBeGreaterThan(10);
  });

  it("appends /scores to lineitem url", () => {
    expect(scoresEndpoint("https://x/line_items/1")).toBe(
      "https://x/line_items/1/scores"
    );
    expect(scoresEndpoint("https://x/line_items/1/scores")).toBe(
      "https://x/line_items/1/scores"
    );
  });

  it("masks secrets", () => {
    expect(maskSecret("abcdefgh")).toBe("ab…gh");
    expect(maskSecret(null)).toBeNull();
  });

  it("push dry-run obtains token without posting scores", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("token")) {
        return {
          ok: true,
          json: async () => ({ access_token: "tok", expires_in: 3600 }),
          text: async () => "",
        } as Response;
      }
      throw new Error("unexpected score post");
    });

    const result = await pushGradebookToAgs({
      credentials: {
        platform: "canvas",
        clientId: "c1",
        clientSecret: "s1",
        tokenUrl: "https://example.edu/token",
        agsLineitemUrl: "https://example.edu/line_items/9",
        authMethod: "client_secret_post",
      },
      learners: [
        {
          learnerId: "u1",
          overall: 90,
          status: "active",
          taskScores: {},
        },
      ],
      dryRun: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.accessTokenObtained).toBe(true);
    expect(result.pushed).toBe(0);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("push posts scores when not dry-run", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("token")) {
        return {
          ok: true,
          json: async () => ({ access_token: "tok" }),
          text: async () => "",
        } as Response;
      }
      expect(String(url)).toContain("/scores");
      expect(init?.method).toBe("POST");
      return { ok: true, status: 204, text: async () => "" } as Response;
    });

    const result = await pushGradebookToAgs({
      credentials: {
        platform: "canvas",
        clientId: "c1",
        clientSecret: "s1",
        tokenUrl: "https://example.edu/token",
        agsLineitemUrl: "https://example.edu/line_items/9",
      },
      learners: [
        { learnerId: "u1", overall: 88, status: "active", taskScores: {} },
        { learnerId: "u2", overall: null, status: "active", taskScores: {} },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
