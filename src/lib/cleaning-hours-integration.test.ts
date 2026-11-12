import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { useCalculationTotals } from "../components/kalkulation/useCalculationTotals";
import { emptyRoomCalculation } from "./room-calculation";

type Input = Parameters<typeof useCalculationTotals>[0];
function totals(patch: Partial<Input> = {}) {
  let result!: ReturnType<typeof useCalculationTotals>;
  function Probe() {
    result = useCalculationTotals({
      roomCalculation: emptyRoomCalculation(), aiPrompt: "", analysisTotals: { sqm: 0, rooms: 0, floors: 0 },
      area: "300", glassArea: "160", hours: "7", hourlyRate: "", pricePerSqm: "",
      discountAmountInput: "0", discountReason: "", extras: [], extrasTotal: 0,
      floors: "0", frequency: "4", frequencyUnit: "month", hasLift: false,
      kiBasis: null, kiItems: [], kiOriginalItem: null, kiPricingBasis: "area", kiPrompt: "",
      laborBurdenPercent: "32", laborWage: "15", liftRate: "0", lvItems: [],
      materialCost: "1,20", mode: "area", note: "", overheadCost: "3,50", pct: 0,
      profitMarkup: "20", raumbuch: undefined,
      selected: { value: "unterhalt", label: "Unterhaltsreinigung", area: 0, hourly: 0, range: [0, 0] },
      selectedPerformanceRate: { id: "u", label: "Unterhaltsreinigung", usage_type: "", floor_covering: "", active: true, sqm_per_hour: 150 },
      setConfirmed: () => {}, stairRate: "0", stairVisitsPerMonth: 4, stairs: false,
      stairsTotal: 0, taxMode: "domestic", travel: "0", type: "unterhalt", visitsPerMonth: 4,
      ...patch,
    } as Input);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}
describe("calculation workload and costing integration", () => {
  it("calculates workload and costs before a selling price is entered", () => {
    const result = totals();
    expect(result.monthlyHours).toBe(8);
    expect(result.monthlySelfCost).toBe(196);
    expect(result.stagedPositions).toEqual([]);
  });
  it("keeps workload unchanged by manual area prices", () => {
    expect(totals({ hourlyRate: "40", pricePerSqm: "9" }).monthlyHours).toBe(8);
  });
  it("uses separate glass area for both workload and price preview", () => {
    const result = totals({ type: "glas", selected: { value: "glas", label: "Glasreinigung", area: 0, hourly: 0, range: [0, 0] },
      selectedPerformanceRate: { id: "g", label: "Glasreinigung", usage_type: "", floor_covering: "", active: true, sqm_per_hour: 80 }, hourlyRate: "40" });
    expect(result.monthlyHours).toBe(8);
    expect(result.stagedPositions[0]?.quantity).toBe(8);
    expect(result.suggested).toBe(320);
  });
  it("preserves manual hours and saved offer positions", () => {
    const result = totals({ mode: "hours", lvItems: [{ id: "saved", description: "Existing offer", quantity: "1", unit: "Pauschal", unit_price: "123" }] });
    expect(result.monthlyHours).toBe(28);
    expect(result.lvTotal).toBe(123);
  });
});

it("keeps room-weighted AI time, live costs, preview and document totals consistent", async () => {
  const { generateCalculation } = await import("./item-ai.server");
  const { calculationTransfer } = await import("./calculation-transfer");
  const { computeDocumentTotals } = await import("./document-totals");
  const { visitsPerMonth } = await import("./constants");
  const calculation = await generateCalculation("Büroreinigung 150 m² plus Küche 20 m² und WC 12 m² einmal pro Woche", undefined, {
    hourlyRate: 38, rates: [{ id: "office", label: "Unterhaltsreinigung", usage_type: "Büro", floor_covering: "", sqm_per_hour: 150, active: true }],
  });
  const result = totals({
    type: "buero", mode: calculation.mode, area: String(calculation.area_sqm),
    hours: String(calculation.hours), hourlyRate: String(calculation.hourly_rate),
    pricePerSqm: String(calculation.price_per_sqm), frequency: "1", frequencyUnit: "week",
    visitsPerMonth: visitsPerMonth(1, "week"),
    selected: { value: "buero", label: "Büroreinigung", area: 0, hourly: 0, range: [0, 0] },
  });
  expect(result.monthlyHours).toBeCloseTo(1.4 * 52 / 12);
  expect(result.monthlySelfCost).toBe(148.63);
  expect(result.suggested).toBe(calculation.items[0]!.unit_price);
  const transfer = calculationTransfer({ workflow: "ki", ai: calculation.items, calculated: result.stagedPositions,
    lv: [], roomEnabled: false, aiStale: false, aiQuestions: [], warnings: [], frequency: 1 });
  expect(transfer.issues).toEqual([]);
  const document = computeDocumentTotals(transfer.positions, 0, 19);
  expect(document.netTotal).toBe(230.53);
  expect(document.vatAmount).toBe(43.8);
  expect(document.grossTotal).toBe(274.33);
});
it("uses analyzed workload for costing when selling by square metre", () => {
 const basis = { type: "unterhalt", mode: "area" as const, area: 182, hours: 1.4, frequency: 4, frequencyUnit: "month" as const, pricePerSqm: 1, hourlyRate: 38, floors: 0 };
 const result = totals({ area: "182", hours: "1,4", pricePerSqm: "1", hourlyRate: "38", kiBasis: basis });
 expect(result.kiBasisChanged).toBe(false);
 expect(result.monthlyHours).toBe(5.6);
 expect(result.monthlySelfCost).toBe(137.2);
 const stale = totals({ area: "200", hours: "1,4", pricePerSqm: "1", hourlyRate: "38", kiBasis: basis });
 expect(stale.kiBasisChanged).toBe(true);
 expect(stale.monthlyHours).toBeCloseTo(200 / 150 * 4);
});
