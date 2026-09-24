import { describe, expect, it } from "vitest";
import authConfig from "@/lib/auth.config";

const authorized = authConfig.callbacks.authorized;

describe("auth middleware authorized callback", () => {
  it("allows an authenticated session", () => {
    expect(authorized({ auth: { user: { id: "u1" } } } as never)).toBe(true);
  });

  it("blocks an anonymous session", () => {
    expect(authorized({ auth: null } as never)).toBe(false);
  });
});
