import { describe, expect, it } from "vitest";
import { checkBodySize, checkRateLimit, validateConsent } from "@/lib/server/request-guards";

describe("request guards", () => {
  it("rejects requests larger than the default body limit", () => {
    expect(checkBodySize(new Request("http://localhost", { headers: { "content-length": "262145" } }))).toBe(false);
    expect(checkBodySize(new Request("http://localhost", { headers: { "content-length": "262144" } }))).toBe(true);
  });

  it("accepts only recent DeepSeek consent proofs", () => {
    expect(validateConsent({ consentId: "c1", consentedAt: new Date().toISOString(), externalServices: ["deepseek"], redactionConfirmed: true })).toBe(true);
    expect(validateConsent({ consentId: "c1", consentedAt: new Date().toISOString(), externalServices: ["openai"], redactionConfirmed: true })).toBe(false);
    expect(validateConsent({ consentId: "c1", consentedAt: new Date().toISOString(), externalServices: ["deepseek"], redactionConfirmed: false })).toBe(false);
  });

  it("rate limits repeated requests in the same scope and address", () => {
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "guard-test" } });
    for (let index = 0; index < 20; index += 1) expect(checkRateLimit(request, "test").ok).toBe(true);
    expect(checkRateLimit(request, "test").ok).toBe(false);
  });
});
