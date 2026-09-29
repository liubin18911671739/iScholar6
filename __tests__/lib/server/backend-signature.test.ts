import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

// `backendIdentityHeaders` lazily imports `@/lib/auth`; mock the session.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { backendIdentityHeaders, backendUrl } from "@/lib/server/backend";

const originalToken = process.env.AGENT_SERVICE_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.AGENT_SERVICE_TOKEN;
  else process.env.AGENT_SERVICE_TOKEN = originalToken;
});

describe("backendIdentityHeaders", () => {
  it("signs the Auth.js user id with HMAC-SHA256 over the service token", async () => {
    process.env.AGENT_SERVICE_TOKEN = "test-secret";
    const headers = await backendIdentityHeaders();
    expect(headers).not.toBeNull();
    const { "X-IScholar-User": user, "X-IScholar-Timestamp": ts, "X-IScholar-Signature": signature } = headers!;
    expect(user).toBe("user-1");
    const expected = createHmac("sha256", "test-secret").update(`${user}:${ts}`).digest("hex");
    expect(signature).toBe(expected);
  });

  it("returns null when the service token is unset", async () => {
    delete process.env.AGENT_SERVICE_TOKEN;
    expect(await backendIdentityHeaders()).toBeNull();
  });
});

describe("backendUrl", () => {
  it("joins the internal URL and path without doubling slashes", () => {
    const original = process.env.BACKEND_INTERNAL_URL;
    process.env.BACKEND_INTERNAL_URL = "http://backend:8000/";
    expect(backendUrl("/v1/data/projects")).toBe("http://backend:8000/v1/data/projects");
    if (original === undefined) delete process.env.BACKEND_INTERNAL_URL;
    else process.env.BACKEND_INTERNAL_URL = original;
  });
});
