import { describe, expect, it } from "vitest";
import { pricingScenarios } from "./pricing-scenarios";

describe("LV pricing scenarios", () => {
  it("does not calculate without valid hours and costs", () => {
    expect(pricingScenarios(0, 25)).toBeNull();
    expect(pricingScenarios(100, 0)).toBeNull();
    expect(pricingScenarios(Number.NaN, 25)).toBeNull();
  });
  it("accounts for extra paid hours without selling more cleaning hours", () => {
    const rows = pricingScenarios(120, 25, 5)!;
    expect(rows[0]!.annualCost).toBe(4500);
    expect(rows[0]!.hourlyRate).toBe(40.5);
    expect(rows[0]!.annualResult).toBe(360);
    expect(pricingScenarios(120, 25, -1)).toBeNull();
  });
  it("keeps each scenario above full cost", () => {
    const rows = pricingScenarios(100, 25.4)!;
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.hourlyRate)).toEqual([27.44, 29.98, 33.02]);
    expect(rows.every(r => r.annualResult > 0)).toBe(true);
  });
});
