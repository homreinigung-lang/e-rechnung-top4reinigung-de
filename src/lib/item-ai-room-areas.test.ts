import { expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const pricing = { hourlyRate: 38, rates: [{ id: "office", label: "Unterhaltsreinigung", usage_type: "Büro", floor_covering: "", sqm_per_hour: 150, active: true }] };
it.each([
  "Büroreinigung 150 m², zusätzlich Teeküche 20 m² und WC 12 m², einmal pro Woche",
  "Büroreinigung 150 m² plus 20 m² Teeküche und 12 m² WC, einmal pro Woche",
])("adds separately specified rooms: %s", async (prompt) => {
  const result = await generateCalculation(prompt, undefined, pricing);
  expect(result.area_sqm).toBe(182);
  expect(result.hours).toBeCloseTo(1.4);
  expect(result.items[0].unit_price).toBe(230.53);
});
it("subtracts included room areas before weighting their time", async () => {
  const result = await generateCalculation("Büroreinigung insgesamt 150 m², davon Teeküche 20 m² und WC 12 m², einmal pro Woche", undefined, pricing);
  expect(result.area_sqm).toBe(150);
  expect(result.hours).toBeCloseTo(118 / 150 + 20 / 100 + 12 / 60);
});
it("uses saved sanitary performance instead of fallback", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus WC 12 m² einmal pro Woche", undefined, { ...pricing, rates: [...pricing.rates, { id: "wc", label: "WC", usage_type: "WC", floor_covering: "", sqm_per_hour: 30, active: true }] });
 expect(result.hours).toBeCloseTo(1.4);
});
it("keeps explicitly specified total working hours authoritative", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus WC 12 m², 3 Stunden je Einsatz, einmal pro Woche", undefined, pricing);
 expect(result.hours).toBe(3);
 expect(result.items[0].unit_price).toBe(494);
});
