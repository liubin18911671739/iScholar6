import { describe, expect, it } from "vitest";
import {
  assertSafeHttpsUrl,
  isBlockedHost,
  jsonSchemaToZod,
} from "@/lib/plugins/mcp-declarative";

describe("declarative MCP security", () => {
  it("blocks private hosts", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("openlibrary.org")).toBe(false);
  });

  it("requires https and safe hosts", () => {
    expect(() => assertSafeHttpsUrl("http://example.com")).toThrow(/https/i);
    expect(() => assertSafeHttpsUrl("https://localhost/x")).toThrow(/Blocked/);
    expect(assertSafeHttpsUrl("https://openlibrary.org/search.json").hostname).toBe(
      "openlibrary.org"
    );
  });

  it("builds zod params from json schema subset", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        q: { type: "string" },
        n: { type: "number" },
      },
      required: ["q"],
    });
    expect(schema.safeParse({ q: "ai" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ q: "a", n: 1 }).success).toBe(true);
  });
});
