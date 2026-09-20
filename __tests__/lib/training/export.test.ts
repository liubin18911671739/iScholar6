import { describe, expect, it } from "vitest";
import {
  mapMembersForExport,
  redactEmail,
  redactId,
  toCsv,
} from "@/lib/training/export";

describe("training export helpers", () => {
  it("builds csv with escaped values", () => {
    const csv = toCsv([
      { name: "Ada", note: 'hello, "world"' },
      { name: "Bob", note: "line\nbreak" },
    ]);
    expect(csv.split("\n")[0]).toContain("name");
    expect(csv).toContain('"hello, ""world"""');
  });

  it("redacts emails and ids", () => {
    expect(redactEmail("alice@example.com")).toBe("a***e@example.com");
    expect(redactId("abcdefghijklmnop")).toMatch(/^abcd…mnop$/);
  });

  it("maps members with optional redaction", () => {
    const rows = mapMembersForExport(
      [
        {
          id: "e1",
          learner_id: "uuid-long-enough-value",
          email: "bob@test.com",
          display_name: "Bob",
          role: "learner",
          status: "active",
        },
      ],
      true
    );
    expect(rows[0].email).toContain("***");
    expect(String(rows[0].learner_id)).toContain("…");
  });
});
