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
