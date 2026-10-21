import { describe, expect, it } from "vitest";
import { validateItems } from "./validate";
import { emptyCalculation } from "./calculation";
import type { LvNormalizedItem } from "./types";

const item = (changes: Partial<LvNormalizedItem> = {}): LvNormalizedItem => ({
  id: "item-1",
  analysis_id: "analysis-1",
  item_number: "1",
  description: "Unterhaltsreinigung",
  category: "unterhaltsreinigung",
  quantity: 100,
  unit: "m²",
  frequency: { label: "5x wöchentlich", perYear: 260 },
  area_m2: 100,
  working_hours: 2,
  unit_price: null,
  total_price: null,
  vat_rate: null,
  calculation: emptyCalculation(),
  source_page: 1,
  confidence_score: 1,
  source_method: "regel",
  approved: false,
  ...changes,
});

describe("LV validation", () => {
  it("flags invalid quantities and frequency", () => {
    const issues = validateItems([item({
      quantity: Number.NaN,
      frequency: { label: "unbekannt", perYear: 0 },
    })]);
    expect(issues.some((issue) => issue.field === "quantity")).toBe(true);
    expect(issues.some((issue) => issue.field === "frequency")).toBe(true);
  });

  it("flags inconsistent square meter measurements", () => {
    const issues = validateItems([item({ quantity: 100, area_m2: 125 })]);
    expect(issues.some((issue) => issue.message.includes("weichen voneinander ab"))).toBe(true);
  });

  it("does not flag matching measurements", () => {
    const issues = validateItems([item()]);
    expect(issues.some((issue) => issue.field === "document")).toBe(false);
  });

  it("flags invalid area and working time", () => {
    const issues = validateItems([item({ area_m2: -1, working_hours: 0 })]);
    expect(issues.filter((issue) => issue.field === "document")).toHaveLength(2);
  });
});
