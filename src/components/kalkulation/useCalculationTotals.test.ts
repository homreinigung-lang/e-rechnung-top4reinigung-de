import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CLEANING_TYPES } from "./shared";
import { WorkloadSummary } from "./WorkloadSummary";
import { CleaningPriceSummary } from "./CleaningPriceSummary";
import { formatMoney } from "@/lib/format";
import type { KalkulationStateContext } from "./useKalkulationState";
import { useCalculationTotals } from "./useCalculationTotals";

type Input = Parameters<typeof useCalculationTotals>[0];
function calculate(patch: Partial<Input> = {}) {
  let result!: ReturnType<typeof useCalculationTotals>;
  const input = {
    roomCalculation: { enabled: false, version: 1, rooms: [] },
    aiPrompt: "", analysisTotals: { sqm: 0, rooms: 0, floors: 0 },
    area: "", discountAmountInput: "0", discountReason: "", extras: ["entsorgung"],
    extrasTotal: 35, floors: "3", frequency: "1", frequencyUnit: "fortnight",
    glassArea: "", hasLift: false, hourlyRate: "35", hours: "0,4",
    kiBasis: null, kiItems: [], kiOriginalItem: null, kiPricingBasis: "hours", kiPrompt: "",
    laborBurdenPercent: "20", laborWage: "20", liftRate: "0", lvItems: [],
    materialCost: "0,4", mode: "hours", note: "", overheadCost: "1", pct: 0,
    pricePerSqm: "0", profitMarkup: "25", raumbuch: null,
    selected: { value: "treppenhaus", label: "Treppenhausreinigung", area: 0.6, hourly: 35, range: [34, 37] },
    setConfirmed: vi.fn(), stairRate: "0", stairVisitsPerMonth: 26 / 12,
    stairs: false, stairsTotal: 0, taxMode: "domestic", travel: "10", type: "treppenhaus",
    visitsPerMonth: 26 / 12, ...patch,
  } as Input;
  function Probe() { result = useCalculationTotals(input); return null; }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

it("keeps the chosen rate for offer positions and full precision for fortnightly costs", () => {
  const totals = calculate();
  expect(totals.monthlyHours).toBeCloseTo(0.4 * 26 / 12, 12);
  expect(totals.costingMonthlyHours).toBe(totals.monthlyHours);
  expect(totals.base).toBe(30.33);
  expect(totals.travelTotal).toBe(21.67);
  expect(totals.suggested).toBe(87.0);
  expect(totals.selfCostPerHour).toBe(25.4);
  expect(totals.targetSellingRate).toBe(31.75);
  expect(totals.monthlySelfCost).toBe(22.01);
  expect(totals.targetMonthlyRevenue).toBe(27.52);
});

it("updates the offer price when the chosen rate changes without applying the recommendation", () => {
  const totals = calculate({ hourlyRate: "40" });
  expect(totals.base).toBe(34.67);
  expect(totals.suggested).toBe(91.34);
  expect(totals.targetSellingRate).toBe(31.75);
});

it.each(CLEANING_TYPES.flatMap(selected => (["hours", "area"] as const).map(mode => ({ selected, mode }))))(
  "keeps workload, cleaning preview and offer price aligned for $selected.value / $mode",
  ({ selected, mode }) => {
    const totals = calculate({ selected, type: selected.value, mode, area: "48", glassArea: "48", pricePerSqm: "0,6", selectedPerformanceRate: { sqm_per_hour: 120 } as Input["selectedPerformanceRate"] });
    const byArea = mode === "area" && selected.value !== "glas";
    const perVisit = byArea ? 28.8 : 14;
    expect(totals.base).toBe(byArea ? 62.4 : 30.45);
    expect(totals.suggested).toBe(byArea ? 119.07 : 87.12);
    const state = { ...totals, mode, type: selected.value, area: "48", glassArea: "48", pricePerSqm: "0,6", hours: "0,4", hourlyRate: "35", frequencyUnit: "fortnight", selectedPerformanceRate: { sqm_per_hour: 120 } } as unknown as KalkulationStateContext;
    const detail = renderToStaticMarkup(createElement(CleaningPriceSummary, { hours: 0.4, state }));
    expect(detail).toContain(`Reinigungspreis je Einsatz (netto): <strong>${formatMoney(perVisit)}`);
    const summary = renderToStaticMarkup(createElement(WorkloadSummary, { state }));
    expect(summary).toContain(formatMoney(totals.suggested));
    expect(summary).toContain(formatMoney(Math.round(totals.suggested * 1.19 * 100) / 100));
  },
);
