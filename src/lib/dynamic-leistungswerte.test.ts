import { describe, expect, it } from "vitest";
import { findCleaningTypeRate, type PerformanceRate } from "./leistungswerte";
import { buildConsolidatedPositions } from "./kalkulation-engine";

const rates: PerformanceRate[] = [
  { id: "u", label: "Unterhaltsreinigung", usage_type: "Allgemein", floor_covering: "Standard", sqm_per_hour: 150, active: true },
  { id: "g", label: "Glasreinigung", usage_type: "Glasflächen", floor_covering: "Glas", sqm_per_hour: 80, active: true },
];

describe("gespeicherte Leistungswerte in der Kalkulation", () => {
  it("wählt den passenden Wert beim Wechsel des Reinigungstyps", () => {
    expect(findCleaningTypeRate(rates, "unterhalt", "Unterhaltsreinigung")?.sqm_per_hour).toBe(150);
    expect(findCleaningTypeRate(rates, "glas", "Glasreinigung")?.sqm_per_hour).toBe(80);
  });

  it("berücksichtigt eine geänderte Einstellung", () => {
    const updated = rates.map(rate => rate.id === "g" ? { ...rate, sqm_per_hour: 70 } : rate);
    expect(findCleaningTypeRate(updated, "glas", "Glasreinigung")?.sqm_per_hour).toBe(70);
  });

  it("verwendet keine fremde Rate, wenn kein Typ passt", () => {
    expect(findCleaningTypeRate(rates, "grund", "Grundreinigung")).toBeNull();
  });

  it("berechnet Glasstunden aus dem gespeicherten Wert", () => {
    const base = {
      typeValue: "glas", typeLabel: "Glasreinigung", mode: "area" as const,
      areaSqm: 160, pricePerSqm: 0, hours: 0, hourlyRate: 40,
      visitsPerMonth: 1, stairs: false, floors: 0, stairRate: 0,
      hasLift: false, liftRate: 0, extras: [], travel: 0,
      discountPercent: 0, discountReason: "",
    };
    expect(buildConsolidatedPositions({ ...base, performanceSqmPerHour: 80 })[0]?.quantity).toBe(2);
    expect(buildConsolidatedPositions({ ...base, performanceSqmPerHour: 70 })[0]?.quantity).toBeCloseTo(160 / 70);
    expect(buildConsolidatedPositions({ ...base, performanceSqmPerHour: 0 })).toEqual([]);
  });
});
