import { describe, expect, it } from "vitest";
import { validateAiConsentProof } from "@/lib/ai/consent";

describe("validateAiConsentProof", () => {
  const now = Date.parse("2026-07-16T00:30:00.000Z");
  const proof = {
    consentId: "consent-1",
    consentedAt: "2026-07-16T00:00:00.000Z",
    externalServices: ["DeepSeek"],
    redactionConfirmed: true,
  };

  it("accepts a recent redaction-confirmed DeepSeek consent", () => {
    expect(validateAiConsentProof(proof, now)).toBe(true);
  });

  it("rejects expired, missing, or unrelated consent", () => {
    expect(validateAiConsentProof({ ...proof, consentedAt: "2026-07-15T23:00:00.000Z" }, now)).toBe(false);
    expect(validateAiConsentProof({ ...proof, externalServices: ["OpenAlex"] }, now)).toBe(false);
    expect(validateAiConsentProof(undefined, now)).toBe(false);
  });
});
