import { describe, expect, it } from "vitest";
import {
  containsSensitiveContent,
  detectSensitiveContent,
  joinTextFields,
  maskSensitiveContent,
  maskSensitiveFields,
  sensitiveScanForAudit,
  summarizeSensitiveMatches,
} from "@/lib/privacy/sensitive-content";

describe("sensitive content detection", () => {
  it("detects common personal data", () => {
    const matches = detectSensitiveContent("邮箱 test@example.com，学号 20240001");
    expect(matches.map((match) => match.category)).toEqual(["email", "student_id"]);
  });

  it("does not flag ordinary research text", () => {
    expect(containsSensitiveContent("短视频与旅游目的地形象传播的文献检索")).toBe(false);
  });

  it("summarizes matches by category", () => {
    const matches = detectSensitiveContent("a@b.com and c@d.com phone 13800138000");
    const summary = summarizeSensitiveMatches(matches);
    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.byCategory.email).toBe(2);
    expect(summary.byCategory.phone).toBe(1);
  });
});

describe("one-click mask", () => {
  it("replaces email and phone with tokens", () => {
    const result = maskSensitiveContent("联系我 13800138000 或 test@example.com");
    expect(result.changed).toBe(true);
    expect(result.applied).toBe(2);
    expect(result.text).toContain("[PHONE]");
    expect(result.text).toContain("[EMAIL]");
    expect(result.text).not.toContain("13800138000");
    expect(result.text).not.toContain("test@example.com");
  });

  it("masks multi-field form state", () => {
    const result = maskSensitiveFields({
      a: "学号：20240001",
      b: "safe research text",
      c: "id 110101199001011234",
    });
    expect(result.applied).toBeGreaterThanOrEqual(2);
    expect(result.fields.a).toContain("[STUDENT_ID]");
    expect(result.fields.b).toBe("safe research text");
    expect(result.fields.c).toContain("[NATIONAL_ID]");
    expect(containsSensitiveContent(joinTextFields(result.fields))).toBe(false);
  });

  it("audit scan never embeds raw PII", () => {
    const scan = sensitiveScanForAudit("email secret@corp.edu");
    expect(scan.total).toBe(1);
    expect(JSON.stringify(scan)).not.toContain("secret@corp.edu");
  });
});
