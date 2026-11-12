import { expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
import type { CompanySellingPricing } from "./company-selling-pricing";
vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const saved: CompanySellingPricing = {
  minimum: 35, maximum: 38,
  rates: [{ id: "saved", label: "Unterhaltsreinigung", usage_type: "Allgemein", floor_covering: "Standard", sqm_per_hour: 150, minutes_per_floor: null, active: true }],
};
it("uses the saved sales price and productivity for the user's hall description", async () => {
  const result = await generateCalculation("zwei hallereinigung ein mal im monat ca 210 m", undefined, saved);
  expect(result.review_questions).toEqual([]);
  expect(result.hourly_rate).toBe(35);
  expect(result.hours).toBe(1.4);
  expect(result.price_per_sqm).toBeCloseTo(35 / 150, 12);
  expect(result.items[0]?.unit_price).toBe(49);
  expect(result.price_source).toBe("company");
  expect(result.review_notes.some(note => note.includes("35,00–38,00"))).toBe(true);
  expect(result.review_notes.some(note => note.includes("Richtwert"))).toBe(false);
});
it("changes the sale when the saved hourly sale price changes, without using wage costs", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, minimum: 38 });
  expect(result.items[0]?.unit_price).toBe(53.2);
});
it("uses the company's saved performance instead of an industry guess", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, rates: [{ ...saved.rates[0]!, sqm_per_hour: 210 }] });
  expect(result.hours).toBe(1);
  expect(result.items[0]?.unit_price).toBe(35);
});
it("never falls back to 0.35 per m² if no selling price is saved", async () => {
  const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { ...saved, minimum: null, maximum: null });
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
