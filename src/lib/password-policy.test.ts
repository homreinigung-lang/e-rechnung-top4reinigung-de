import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, PASSWORD_MIN_LENGTH } from "./password-policy";

describe("password policy", () => {
  it("requires at least 12 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(checkPasswordPolicy("Abcdef12345").valid).toBe(false);
  });

  it("requires uppercase, lowercase and a number", () => {
    expect(checkPasswordPolicy("abcdefghijkl1").valid).toBe(false);
    expect(checkPasswordPolicy("ABCDEFGHIJKL1").valid).toBe(false);
    expect(checkPasswordPolicy("Abcdefghijkl").valid).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(checkPasswordPolicy("GebCalc2026Sicher").valid).toBe(true);
  });
});
