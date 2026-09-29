import { afterEach, describe, expect, it } from "vitest";
import { createInviteToken, verifyInviteToken } from "@/lib/server/invite-token";

const originalSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("invite tokens", () => {
  it("round-trips a normalized email", () => {
    process.env.AUTH_SECRET = "test-secret";
    const token = createInviteToken("User@Example.com");
    expect(token).toBeTruthy();
    expect(verifyInviteToken(token!)?.email).toBe("user@example.com");
  });

  it("rejects a tampered signature", () => {
    process.env.AUTH_SECRET = "test-secret";
    const token = createInviteToken("user@example.com")!;
    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyInviteToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    process.env.AUTH_SECRET = "test-secret";
    const token = createInviteToken("user@example.com", 0)!; // exp ≈ 1970 + 7d
    expect(verifyInviteToken(token, 30 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("returns null when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;
    expect(createInviteToken("user@example.com")).toBeNull();
  });
});
