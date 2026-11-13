import { expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
import { CALCULATION_EXAMPLES } from "./calculation-examples";
vi.mock("./gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));
const rates = [
 { id: "u", label: "Unterhaltsreinigung", usage_type: "Allgemein", sqm_per_hour: 150 },
 { id: "g", label: "Grundreinigung", usage_type: "Allgemein", sqm_per_hour: 110 },
 { id: "t", label: "Treppenhaus", usage_type: "Treppenhaus", sqm_per_hour: 110, minutes_per_floor: 8 },
 { id: "f", label: "Glasreinigung", usage_type: "Fenster", sqm_per_hour: 70 },
].map(rate => ({ floor_covering: "", active: true, ...rate }));
it("keeps the exact staircase example clean and calculates the saved eight minutes per floor", async () => {
 const result = await generateCalculation("Treppenhausreinigung, 4 Etagen, alle 14 Tage", undefined, { hourlyRate: 38, rates });
 expect(result.review_questions).toEqual([]);
 expect(result.items).toHaveLength(1);
 expect(result.items[0]?.description).toBe("Treppenhausreinigung (4 Etagen, 1× alle 2 Wochen (14-tägig))");
 expect(result.items[0]?.unit_price).toBe(43.91);
 expect(result.items[0]?.unit).toBe("Monat");
});
it.each(CALCULATION_EXAMPLES)("understands the product example $label without price guessing", async ({ prompt }) => {
 const result = await generateCalculation(prompt, undefined, { hourlyRate: 35, rates });
 expect(result.review_questions).toEqual([]);
 expect(result.items.length).toBeGreaterThan(0);
 expect(result.hourly_rate).toBe(35);
 const noPrice = await generateCalculation(prompt, undefined, { hourlyRate: null, rates });
 expect(noPrice.items).toEqual([]);
 expect(noPrice.review_questions.join(" ")).toContain("Verkaufspreis");
});
it.each([
 ["Wohnungsreinigung 90 Minuten einmalig", 1.5, 52.5],
 ["Büroreinigung eineinhalb Stunden pro Besuch, ein mal im Monat", 1.5, 52.5],
 ["Büroreinigung 1 Stunde 30 Minuten einmal im Monat", 1.5, 52.5],
 ["Büroreinigung 20 Stunden pro Monat, 2 mal pro Woche", 20 / (2 * 52 / 12), 700],
 ["Büroreinigung 5 Stunden pro Woche, 2 mal pro Woche", 2.5, 758.33],
 ["Hallenreinigung 210 m^2 alle 2 Monate", 1.4, 24.5],
 ["Treppenhaus 4 Etagen alle 14 Tage", 4 * 8 / 60, 40.44],
] as const)("calculates colloquial duration and recurrence: %s", async (prompt, hours, amount) => {
 const result = await generateCalculation(prompt, undefined, { hourlyRate: 35, rates });
 expect(result.review_questions).toEqual([]);
 expect(result.hours).toBeCloseTo(hours, 10);
 expect(result.items[0]?.unit_price).toBe(amount);
});
it("does not silently turn monthly work time into one-time work", async () => {
 const result = await generateCalculation("Wohnungsreinigung 20 Stunden pro Monat", undefined, { hourlyRate: 35, rates });
 expect(result.items).toEqual([]);
 expect(result.review_questions.join(" ")).toContain("Turnus");
});
it("asks about genuinely ambiguous separate room durations", async () => {
 const result = await generateCalculation("Büroreinigung 2 Stunden und WC 30 Minuten, einmal pro Woche", undefined, { hourlyRate: 35, rates });
 expect(result.items).toEqual([]);
 expect(result.review_questions.join(" ")).toContain("gesamte Reinigungsdauer");
});

it.each([
 ["Hallenreinigung 2 Hallen je 210 m² einmal im Monat", 420, 98],
 ["Hallenreinigung zwei Hallen mit jeweils 210 qm einmal im Monat", 420, 98],
 ["Hallenreinigung 2 Hallen insgesamt 210 m² einmal im Monat", 210, 49],
 ["Hallenreinigung 2 Hallen je 105 m², insgesamt 210 m², einmal im Monat", 210, 49],
] as const)("distinguishes per-room area from the total: %s", async (prompt, area, amount) => {
 const result = await generateCalculation(prompt, undefined, { hourlyRate: 35, rates });
 expect(result.review_questions).toEqual([]);
 expect(result.area_sqm).toBe(area);
 expect(result.items[0]?.unit_price).toBe(amount);
});
it.each([35, 42])("examples adapt to each job's actual %s EUR rate", async hourlyRate => {
 const result = await generateCalculation("Hallenreinigung 210 qm einmal im Monat", undefined, { hourlyRate, rates });
 expect(result.items[0]?.unit_price).toBeCloseTo(1.4 * hourlyRate);
});

it.each([
 ["Treppenhaus 4 Etagen alle vierzehn Tage", 4 * 8 / 60, 40.44],
 ["Treppenhaus 4 Etagen zweimal alle 14 Tage", 4 * 8 / 60, 80.89],
 ["Hallenreinigung 210 qm jeden zweiten Monat", 1.4, 24.5],
 ["Grundreinigung zweieinhalb Stunden einmalig", 2.5, 87.5],
] as const)("understands spoken recurrence and duration: %s", async (prompt, hours, amount) => {
 const result = await generateCalculation(prompt, undefined, { hourlyRate: 35, rates });
 expect(result.review_questions).toEqual([]);
 expect(result.hours).toBeCloseTo(hours, 10);
 expect(result.items[0]?.unit_price).toBe(amount);
});

it("asks about conflicting overall and per-hall areas instead of silently charging the smaller area", async () => {
 const result = await generateCalculation("Hallenreinigung 2 Hallen je 210 qm, insgesamt 210 qm, einmal im Monat", undefined, { hourlyRate: 35, rates });
 expect(result.items).toEqual([]);
 expect(result.review_questions.join(" ")).toContain("Gesamtfläche ist kleiner");
});
