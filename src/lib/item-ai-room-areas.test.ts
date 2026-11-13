import { expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const pricing = { hourlyRate: 38, rates: [{ id: "kitchen", label: "Küche", usage_type: "Küche", floor_covering: "", sqm_per_hour: 100, active: true }, { id: "sanitary", label: "WC", usage_type: "WC", floor_covering: "", sqm_per_hour: 60, active: true }, { id: "office", label: "Unterhaltsreinigung", usage_type: "Büro", floor_covering: "", sqm_per_hour: 150, active: true }] };
it.each([
  "Büroreinigung 150 m², zusätzlich Teeküche 20 m² und WC 12 m², einmal pro Woche",
  "Büroreinigung 150 m² plus 20 m² Teeküche und 12 m² WC, einmal pro Woche",
])("adds separately specified rooms: %s", async (prompt) => {
  const result = await generateCalculation(prompt, undefined, pricing);
  expect(result.area_sqm).toBe(182);
  expect(result.hours).toBeCloseTo(1.4);
  expect(result.items[0]!.unit_price).toBe(230.53);
});
it("subtracts included room areas before weighting their time", async () => {
  const result = await generateCalculation("Büroreinigung insgesamt 150 m², davon Teeküche 20 m² und WC 12 m², einmal pro Woche", undefined, pricing);
  expect(result.area_sqm).toBe(150);
  expect(result.hours).toBeCloseTo(118 / 150 + 20 / 100 + 12 / 60);
});
it("uses saved sanitary performance instead of fallback", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus WC 12 m² einmal pro Woche", undefined, { ...pricing, rates: [...pricing.rates.filter(rate => rate.usage_type !== "WC"), { id: "wc", label: "WC", usage_type: "WC", floor_covering: "", sqm_per_hour: 30, active: true }] });
 expect(result.hours).toBeCloseTo(1.4);
});
it("keeps explicitly specified total working hours authoritative", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus WC 12 m², 3 Stunden je Einsatz, einmal pro Woche", undefined, pricing);
 expect(result.hours).toBe(3);
 expect(result.items[0]!.unit_price).toBe(494);
});
it("preserves weighted hours for workload and costs instead of treating all rooms as office", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus Teeküche 20 m² und WC 12 m², einmal pro Woche", undefined, pricing);
 expect(result.mode).toBe("hours");
 expect(result.pricing_basis).toBe("hours");
 expect(result.items[0]!.description).toContain("teeküche 20 m²");
 expect(result.items[0]!.description).toContain("wc 12 m²");
});
it("changes monthly prices when additional room areas change", async () => {
 const small = await generateCalculation("Büroreinigung 150 m² plus WC 12 m² einmal pro Woche", undefined, pricing);
 const large = await generateCalculation("Büroreinigung 150 m² plus WC 30 m² einmal pro Woche", undefined, pricing);
 expect(large.hours).toBeGreaterThan(small.hours);
 expect(large.items[0]!.unit_price).toBeGreaterThan(small.items[0]!.unit_price);
});
it("blocks inconsistent included areas", async () => {
 const result = await generateCalculation("Büroreinigung insgesamt 150 m² davon WC 200 m² einmal pro Woche", undefined, pricing);
 expect(result.items).toEqual([]);
 expect(result.review_questions.length).toBeGreaterThan(0);
});
it("respects a stated square metre price", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus WC 12 m² einmal pro Woche, 1 Euro pro m²", undefined, pricing);
 expect(result.items[0]!.unit_price).toBe(702);
});
it("keeps explicit working hours authoritative even without saved settings", async () => {
 const result = await generateCalculation("Büroreinigung 150 m², 3 Stunden pro Einsatz, 38 Euro pro Stunde, einmal pro Woche");
 expect(result.mode).toBe("hours");
 expect(result.hours).toBe(3);
 expect(result.items[0]!.unit_price).toBe(494);
});
it("uses unrounded visit cost to derive the monthly price", async () => {
 const result = await generateCalculation("Büroreinigung 101 m² einmal pro Woche", undefined, pricing);
 expect(result.items[0]!.unit_price).toBe(110.88);
});
it.each([
 ["once", 1, 53.2], ["week", 2, 461.07], ["fortnight", 1, 115.27],
 ["month", 2, 106.4], ["quarter", 1, 17.73], ["year", 1, 4.43],
] as const)("uses the same weighted hours for %s recurrence", async (unit, value, expected) => {
 const result = await generateCalculation("Büroreinigung 150 m² plus Küche 20 m² und WC 12 m²", { unit, value }, pricing);
 expect(result.hours).toBeCloseTo(1.4);
 expect(result.items[0]!.unit_price).toBe(expected);
});
it("asks about all missing room areas together instead of silently calculating one office hour", async () => {
 const result = await generateCalculation("Büroreinigung einmal inder woche 150m2 Ein wc ein teeküche", undefined, pricing);
 expect(result.items).toEqual([]);
 expect(result.review_questions).toHaveLength(1);
 expect(result.review_questions[0]).toContain("Küche/Teeküche und WC/Sanitär");
});
it("does not apply office frequency silently to a differently scheduled kitchen", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² einmal pro Woche, Küche 20 m² zweimal pro Woche", undefined, pricing);
 expect(result.items).toEqual([]);
 expect(result.review_questions).toContain("Bitte die unterschiedlichen Reinigungsturnusse von Hauptfläche und Zusatzräumen getrennt angeben.");
});
it("keeps the weighted workload when an explicit square metre selling price is used", async () => {
 const result = await generateCalculation("Büroreinigung 150 m² plus Küche 20 m² und WC 12 m² einmal pro Woche, 1 Euro pro m²", undefined, pricing);
 expect(result.mode).toBe("area");
 expect(result.hours).toBeCloseTo(1.4);
 expect(result.items[0]!.unit_price).toBe(788.67);
});
