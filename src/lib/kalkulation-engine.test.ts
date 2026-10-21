import { describe, expect, it } from "vitest";
import { checkPlausibility } from "./kalkulation-engine";

describe("hourly revenue plausibility", () => {
  it("warns even when area is missing", () => {
    const warnings = checkPlausibility({ areaSqm: 0, rooms: 0, floors: 0, monthlyNet: 600, hoursPerMonth: 30 });
    expect(warnings.some((message) => message.includes("Stundenerlös"))).toBe(true);
  });
  it("does not duplicate the warning when area is present", () => {
    const warnings = checkPlausibility({ areaSqm: 300, rooms: 6, floors: 1, monthlyNet: 600, hoursPerMonth: 30 });
    expect(warnings.filter((message) => message.includes("Stundenerlös"))).toHaveLength(1);
  });
  it("does not warn for a sufficient rate", () => {
    const warnings = checkPlausibility({ areaSqm: 0, rooms: 0, floors: 0, monthlyNet: 900, hoursPerMonth: 30 });
    expect(warnings.some((message) => message.includes("Stundenerlös"))).toBe(false);
  });
});
