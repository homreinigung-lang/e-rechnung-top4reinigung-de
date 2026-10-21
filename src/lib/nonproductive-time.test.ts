import { describe, expect, it } from "vitest";
import { calculateNonproductiveTime } from "./nonproductive-time";

describe("calculateNonproductiveTime", () => {
  it("accounts for paid travel and preparation without charging material twice", () => {
    const result = calculateNonproductiveTime({
      cleaningHoursPerMonth: 100,
      paidTravelHoursPerMonth: 10,
      paidPreparationHoursPerMonth: 5,
      laborCostPerHour: 19.8,
      materialCostPerCleaningHour: 1.2,
      overheadCostPerPaidHour: 3.5,
      profitMarkupPercent: 20,
    });
    expect(result.paidHoursPerMonth).toBe(115);
    expect(result.nonproductiveHoursPerMonth).toBe(15);
    expect(result.totalMonthlyCost).toBe(2799.5);
    expect(result.breakEvenPerCleaningHour).toBe(28);
    expect(result.targetPerCleaningHour).toBe(33.59);
  });

  it("does not divide by zero when no cleaning hours are entered", () => {
    const result = calculateNonproductiveTime({
      cleaningHoursPerMonth: 0,
      paidTravelHoursPerMonth: 2,
      laborCostPerHour: 20,
    });
    expect(result.breakEvenPerCleaningHour).toBeNull();
    expect(result.targetPerCleaningHour).toBeNull();
    expect(result.totalMonthlyCost).toBe(40);
  });

  it("ignores invalid and negative time entries", () => {
    const result = calculateNonproductiveTime({
      cleaningHoursPerMonth: 10,
      paidTravelHoursPerMonth: -4,
      paidPreparationHoursPerMonth: Number.NaN,
      laborCostPerHour: 20,
    });
    expect(result.nonproductiveHoursPerMonth).toBe(0);
    expect(result.totalMonthlyCost).toBe(200);
  });
});
