import { expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
import { companyCostSellingBasis, type CompanySellingPricing } from "./company-selling-pricing";
vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const saved: CompanySellingPricing = {
  hourlyRate: 35,
  rates: [{ id: "saved", label: "Unterhaltsreinigung", usage_type: "Allgemein", floor_covering: "Standard", sqm_per_hour: 150, minutes_per_floor: null, active: true }],
};
it("uses the job selling price and productivity for the user's hall description", async () => {
  const result = await generateCalculation("zwei hallereinigung ein mal im monat ca 210 m", undefined, saved);
  expect(result.review_questions).toEqual([]);
  expect(result.hourly_rate).toBe(35);
  expect(result.hours).toBe(1.4);
  expect(result.price_per_sqm).toBeCloseTo(35 / 150, 12);
  expect(result.items[0]?.unit_price).toBe(49);
  expect(result.price_source).toBe("job");
  expect(result.review_notes.some(note => note.includes("für diesen Auftrag: 35,00"))).toBe(true);
  expect(result.review_notes.some(note => note.includes("Richtwert"))).toBe(false);
});
it("changes the sale when the job hourly sale price changes, without using wage costs", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, hourlyRate: 38 });
  expect(result.items[0]?.unit_price).toBe(53.2);
});
it("uses the company's saved performance instead of an industry guess", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, rates: [{ ...saved.rates[0]!, sqm_per_hour: 210 }] });
  expect(result.hours).toBe(1);
  expect(result.items[0]?.unit_price).toBe(35);
});
it("never falls back to 0.35 per m² if no selling price is entered for the job", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, hourlyRate: null });
  expect(result.items).toEqual([]);
  expect(result.review_questions.join(" ")).toContain("Verkaufspreis");
});
it("asks only for missing performance instead of guessing work time", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, rates: [] });
  expect(result.items).toEqual([]);
  expect(result.review_questions.join(" ")).toContain("Leistungswert");
});
it("respects explicitly specified hours and a customer's agreed hourly rate", async () => {
  const result = await generateCalculation("Büroreinigung 2 Stunden pro Einsatz, 40 EUR pro Stunde, 1 mal im Monat", undefined, saved);
  expect(result.hourly_rate).toBe(40);
  expect(result.items[0]?.unit_price).toBe(80);
  expect(result.price_source).toBe("stated");
});
it("uses explicit visit duration with area instead of deriving another duration", async () => {
  const result = await generateCalculation("Büroreinigung 210 qm, 2 Stunden pro Einsatz, 1 mal im Monat", undefined, saved);
  expect(result.hours).toBe(2);
  expect(result.items[0]?.unit_price).toBe(70);
});
it("retains an explicitly agreed m² price", async () => {
  const result = await generateCalculation("Büroreinigung 210 qm, 0,50 EUR pro qm, 1 mal im Monat", undefined, saved);
  expect(result.items[0]?.unit_price).toBe(105);
  expect(result.price_source).toBe("stated");
});
it("calculates stairs from saved minutes per floor and selling price", async () => {
  const result = await generateCalculation("Treppenhaus 4 Etagen einmal im Monat", undefined, { ...saved, rates: [{ ...saved.rates[0]!, label: "Treppenhaus", minutes_per_floor: 8 }] });
  expect(result.items[0]?.unit_price).toBe(18.67);
  expect(result.floor_rate).toBeCloseTo(35 * 8 / 60);
});

it.each([[105, 24.5], [210, 49], [450, 105]])("scales %s m² with actual work hours instead of reusing a fixed total", async (area, total) => {
  const result = await generateCalculation(`Hallenreinigung ${area} qm einmal im Monat`, undefined, saved);
  expect(result.hours).toBeCloseTo(area / 150);
  expect(result.items[0]?.unit_price).toBe(total);
});
it("supports another job's selling rate outside the example range", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, hourlyRate: 42 });
  expect(result.hourly_rate).toBe(42);
  expect(result.items[0]?.unit_price).toBe(58.8);
});
it("scales recurring visits as well as the object area", async () => {
  const result = await generateCalculation("Hallenreinigung 450 qm zwei mal im Monat", undefined, saved);
  expect(result.items[0]?.unit_price).toBe(210);
});

it("shows a result from saved company costs and productivity without another price question", async () => {
  const basis = companyCostSellingBasis({ calc_worker_hourly_wage: 20, calc_labor_burden_percent: 30,
    calc_material_cost_hour: 2, calc_overhead_cost_hour: 4, calc_profit_markup_percent: 25 })!;
  const result = await generateCalculation("Büroreinigung 300 qm alle zwei Wochen", undefined, {
    ...saved, hourlyRate: basis.hourlyRate, source: "company", costBasis: basis,
  });
  expect(result.review_questions).toEqual([]);
  expect(result.hours).toBe(2);
  expect(result.hourly_rate).toBe(40);
  expect(result.items[0]?.unit_price).toBe(173.33);
  expect(result.price_source).toBe("company");
  expect(result.review_notes.join(" ")).toContain("Selbstkosten 32,00 €/Std. + 25 %");
});
it("recognizes the user's exact dictated job and gives the stated rate priority", async () => {
  const result = await generateCalculation("Reinigung büro 250m einmal in zwei Wochen 2,5 stunden Pro Einsatz 38€ kostet stunden", undefined, {
    ...saved, hourlyRate: 40, source: "company", costBasis: { selfCostPerHour: 32, profitMarkupPercent: 25 },
  });
  expect(result.review_questions).toEqual([]);
  expect(result.hourly_rate).toBe(38);
  expect(result.hours).toBe(2.5);
  expect(result.items[0]?.unit_price).toBe(205.83);
  expect(result.price_source).toBe("stated");
  expect(result.review_notes.join(" ")).not.toContain("Aus gespeicherten Firmendaten berechnet");
});
it.each([null, -1, Number.NaN])("asks for incomplete or invalid company cost inputs: %s", value => {
  expect(companyCostSellingBasis({ calc_worker_hourly_wage: value, calc_labor_burden_percent: 30,
    calc_material_cost_hour: 2, calc_overhead_cost_hour: 4, calc_profit_markup_percent: 25 })).toBeNull();
});

it("asks for a missing saved room performance instead of using an industry estimate", async () => {
  const result = await generateCalculation("Büroreinigung 150 qm plus Küche 20 qm einmal pro Woche", undefined, saved);
  expect(result.items).toEqual([]);
  expect(result.review_questions.join(" ")).toContain("Leistungswerte");
});
