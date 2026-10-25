import { describe, expect, it } from "vitest";
import { cleaningHoursPerVisit, pricePerSqmFromHourly } from "./cleaning-hours";
import { findCleaningTypeRate, type PerformanceRate } from "./leistungswerte";

const rates: PerformanceRate[] = [
  { id: "old", label: "Glas- / Fensterfläche", usage_type: "Fenster", floor_covering: "Glas", sqm_per_hour: 40, active: true },
  ...[["unterhalt", "Unterhaltsreinigung", 150], ["grund", "Grundreinigung", 50],
    ["glas", "Glasreinigung", 80], ["treppenhaus", "Treppenhaus", 120]].map(([id, label, rate]) => ({
      id: String(id), label: String(label), usage_type: "Allgemein", floor_covering: "",
      sqm_per_hour: Number(rate), active: true,
    })),
];
const base = { mode: "area" as const, typeValue: "unterhalt", area: 300, glassArea: 160, hours: 7, sqmPerHour: 150 };

describe("workload from saved productivity, independent of prices", () => {
  it.each([["unterhalt", 2], ["grund", 6], ["glas", 2], ["treppenhaus", 2.5]])(
    "%s uses its central saved rate", (typeValue, expected) => {
      const rate = findCleaningTypeRate(rates, typeValue, typeValue);
      expect(cleaningHoursPerVisit({ ...base, typeValue, sqmPerHour: rate!.sqm_per_hour })).toBe(expected);
    },
  );
  it("updates with area and saved productivity without a selling price", () => {
    expect(cleaningHoursPerVisit(base)).toBe(2);
    expect(cleaningHoursPerVisit({ ...base, area: 600 })).toBe(4);
    expect(cleaningHoursPerVisit({ ...base, sqmPerHour: 100 })).toBe(3);
  });
  it("uses glass area and preserves full precision before recurrence", () => {
    expect(cleaningHoursPerVisit({ ...base, typeValue: "glas", sqmPerHour: 70 }) * 4).toBeCloseTo(160 / 70 * 4);
  });
  it("preserves explicitly entered hours", () => {
    expect(cleaningHoursPerVisit({ ...base, mode: "hours", sqmPerHour: 0 })).toBe(7);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid productivity %s", sqmPerHour => {
    expect(cleaningHoursPerVisit({ ...base, sqmPerHour })).toBe(0);
  });
  it("never falls back to an inactive central rate", () => {
    const rate = findCleaningTypeRate(rates.map(r => ({ ...r, active: false })), "grund", "Grundreinigung");
    expect(rate).toBeNull();
    expect(cleaningHoursPerVisit({ ...base, sqmPerHour: rate?.sqm_per_hour ?? 0 })).toBe(0);
  });
});

describe("derived area prices retain precision", () => {
  it("does not lose a cent for two hours of staircase cleaning", () => {
    expect(Math.round(240 * pricePerSqmFromHourly(40, 120) * 100) / 100).toBe(80);
  });
  it("rounds deep-cleaning totals only after multiplying the full derived price", () => {
    expect(Math.round(340 * pricePerSqmFromHourly(40, 120) * 100) / 100).toBe(113.33);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid productivity %s", rate => {
    expect(pricePerSqmFromHourly(40, rate)).toBe(0);
  });
});
