import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useCalculationTotals } from "@/components/kalkulation/useCalculationTotals";
import { CLEANING_TYPES } from "@/components/kalkulation/shared";
import { type CalculationRoom, emptyRoomCalculation, roomsFromScan } from "./room-calculation";
import { DEFAULT_PERFORMANCE_RATES } from "./leistungswerte";

function totals(enabled = true) {
  const rates = DEFAULT_PERFORMANCE_RATES.map((rate, i) => ({
    ...rate,
    id: String(i),
    active: true,
  }));
  const rooms: CalculationRoom[] = roomsFromScan(
    "plan.pdf",
    [{ name: "Büro", floor: "EG", usage_type: "Büro", floor_covering: "Teppich", area_sqm: 30 }],
    rates,
  ).map((room) => ({ ...room, calculationMode: "area" as const, frequency: "2" }));
  return {
    roomCalculation: { ...emptyRoomCalculation(), enabled, rooms },
    aiPrompt: "",
    analysisTotals: { sqm: 30, rooms: 1, floors: 1 },
    area: "999",
    discountAmountInput: "0",
    discountReason: "",
    extras: [],
    extrasTotal: 0,
    floors: "1",
    frequency: "1",
    frequencyUnit: "month",
    glassArea: "0",
    hasLift: false,
    hourlyRate: "35",
    hours: "50",
    kiBasis: null,
    kiItems: [],
    kiOriginalItem: null,
    kiPricingBasis: "hours",
    kiPrompt: "",
    laborBurdenPercent: "32",
    laborWage: "15",
    glassGrossWage: "18",
    liftRate: "0",
    lvItems: [],
    materialCost: "1,20",
    mode: "hours",
    note: "",
    overheadCost: "3,50",
    pct: 0,
    pricePerSqm: "0,35",
    profitMarkup: "20",
    raumbuch: {
      roomCount: 1,
      totalArea: 999,
      totalGlassArea: 0,
      hoursPerVisit: 80,
      matched: 1,
      unmatched: 0,
    },
    selected: CLEANING_TYPES[0]!,
    setConfirmed: vi.fn(),
    stairRate: "12,5",
    stairVisitsPerMonth: 1,
    stairs: false,
    stairsTotal: 0,
    taxMode: "domestic",
    travel: "0",
    type: "unterhalt",
    visitsPerMonth: 1,
  } satisfies Parameters<typeof useCalculationTotals>[0];
}

function renderTotals(input: Parameters<typeof useCalculationTotals>[0]) {
  let result: ReturnType<typeof useCalculationTotals> | undefined;
  function Component() {
    result = useCalculationTotals(input);
    return null;
  }
  renderToStaticMarkup(createElement(Component));
  return result!;
}

it("nutzt geprüfte Raumstunden für Preis UND Kosten statt alter Formular- oder Projektstunden", () => {
  const result = renderTotals(totals());
  expect(result.monthlyHours).toBe(1.04);
  expect(result.costingMonthlyHours).toBe(1.04);
  expect(result.stagedPositions).toHaveLength(1);
  expect(result.stagedPositions[0]?.quantity).toBe(1.04);
  expect(result.suggested).toBe(36.4);
  expect(result.monthlySelfCost).toBe(25.48);
});

it("erhält manuelle Kalkulationen, wenn die Raumquelle nicht aktiviert ist", () => {
  const result = renderTotals(totals(false));
  expect(result.monthlyHours).toBe(50);
  expect(result.costingMonthlyHours).toBe(80);
  expect(result.stagedPositions[0]?.quantity).toBe(50);
});

it("blockiert unvollständige aktive Raumdaten und verhindert zusätzliche Treppenpauschalen", () => {
  const input = totals();
  input.roomCalculation.rooms[0]!.frequency = "";
  const result = renderTotals({ ...input, stairs: true, stairsTotal: 12.5 });
  expect(result.warnings.some((warning) => warning.includes("Turnus"))).toBe(true);
  expect(result.stagedPositions).toEqual([]);
  expect(result.base).toBe(0);
});

it("übernimmt Minuten inklusive Aufgaben in Preis und Selbstkosten statt Flächenvorschlag", () => {
  const input = totals();
  input.roomCalculation.rooms[0] = {
    ...input.roomCalculation.rooms[0]!,
    calculationMode: "minutes",
    minutesPerVisit: "90",
    tasks: "Alle vereinbarten Aufgaben",
    frequency: "1",
  };
  const result = renderTotals(input);
  expect(result.monthlyHours).toBe(6.5);
  expect(result.costingMonthlyHours).toBe(6.5);
  expect(result.suggested).toBe(227.5);
  expect(result.monthlySelfCost).toBe(159.25);
  expect(result.stagedPositions[0]?.description).toContain("Alle vereinbarten Aufgaben");
});

it("berechnet Glas-Bruttolohn nur einmal und addiert Arbeitgeberkosten, Material und Gemeinkosten", () => {
  const input = totals(false);
  const result = renderTotals({ ...input, type: "glas", selected: CLEANING_TYPES.find((item) => item.value === "glas")!, raumbuch: null });
  expect(result.selfCostPerHour).toBe(28.46);
  expect(result.targetSellingRate).toBe(34.15);
  expect(result.monthlySelfCost).toBe(1423);
  expect(result.stagedPositions).toHaveLength(1);
});

it("aktualisiert Glas-Selbstkosten bei Bruttolohnänderung und lässt andere Reinigungsarten unverändert", () => {
  const input = totals(false);
  const glass = { ...input, type: "glas", selected: CLEANING_TYPES.find((item) => item.value === "glas")!, raumbuch: null };
  expect(renderTotals({ ...glass, glassGrossWage: "19" }).selfCostPerHour).toBe(29.78);
  expect(renderTotals({ ...glass, glassGrossWage: "19" }).targetSellingRate).toBe(35.74);
  expect(renderTotals({ ...input, glassGrossWage: "19", raumbuch: null }).selfCostPerHour).toBe(24.5);
});
