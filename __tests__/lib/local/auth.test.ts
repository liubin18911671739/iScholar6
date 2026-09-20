import { describe, it, expect, beforeEach } from "vitest";
import {
  setPassword,
  hasPassword,
  verifyPassword,
  validatePasswordStrength,
  changePassword,
  createSession,
  isAuthenticated,
  logout,
} from "@/lib/local/auth";

describe("validatePasswordStrength", () => {
  it("accepts a strong password", () => {
    const result = validatePasswordStrength("StrongP@ss1");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects short passwords", () => {
    const result = validatePasswordStrength("Ab1");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("至少8个字符");
  });

  it("rejects passwords without uppercase", () => {
    const result = validatePasswordStrength("abcdefg1");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("至少一个大写字母");
  });

  it("rejects passwords without lowercase", () => {
    const result = validatePasswordStrength("ABCDEFG1");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("至少一个小写字母");
  });

  it("rejects passwords without a number", () => {
    const result = validatePasswordStrength("Abcdefgh");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("至少一个数字");
  });

  it("returns multiple errors for very weak password", () => {
    const result = validatePasswordStrength("x");
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("password lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("hasPassword returns false initially", () => {
    expect(hasPassword()).toBe(false);
  });

  it("setPassword stores hash and hasPassword returns true", async () => {
    await setPassword("TestPass1");
    expect(hasPassword()).toBe(true);
    // Should not store plaintext
    expect(localStorage.getItem("ischolar_auth_hash")).not.toBe("TestPass1");
  });

  it("verifyPassword returns true for correct password", async () => {
    await setPassword("TestPass1");
    const result = await verifyPassword("TestPass1");
    expect(result).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    await setPassword("TestPass1");
    const result = await verifyPassword("WrongPass1");
    expect(result).toBe(false);
  });

  it("verifyPassword returns false when no password is set", async () => {
    const result = await verifyPassword("anything");
    expect(result).toBe(false);
  });
});

describe("changePassword", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("succeeds with correct current password and valid new password", async () => {
    await setPassword("OldPass1");
    const result = await changePassword("OldPass1", "NewPass1");
    expect(result.success).toBe(true);
    // New password should work
    expect(await verifyPassword("NewPass1")).toBe(true);
    // Old password should not work
    expect(await verifyPassword("OldPass1")).toBe(false);
  });

  it("fails with incorrect current password", async () => {
    await setPassword("OldPass1");
    const result = await changePassword("WrongPass1", "NewPass1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("不正确");
  });

  it("fails with weak new password", async () => {
    await setPassword("OldPass1");
    const result = await changePassword("OldPass1", "weak");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("session management", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("isAuthenticated returns false initially", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("createSession makes isAuthenticated return true", () => {
    createSession();
    expect(isAuthenticated()).toBe(true);
  });

  it("logout clears session", () => {
    createSession();
    logout();
    expect(isAuthenticated()).toBe(false);
  });

  it("logout keeps password hash", async () => {
    await setPassword("TestPass1");
    createSession();
    logout();
    // Can still verify password
    expect(hasPassword()).toBe(true);
    expect(await verifyPassword("TestPass1")).toBe(true);
  });
});
