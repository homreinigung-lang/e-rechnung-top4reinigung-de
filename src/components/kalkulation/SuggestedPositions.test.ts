import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SuggestedPositions } from "./SuggestedPositions";
import type { KalkulationStateContext } from "./useKalkulationState";
import { generateCalculation } from "@/lib/item-ai.server";
import { visitsPerMonth, visitsPerYear } from "@/lib/constants";

vi.mock("@/lib/gemini-json.server", () => ({ generateGeminiJson: vi.fn() }));

it("explains time-based staircase prices without an unrelated area-price warning", () => {
 const state = {
  aiReviewQuestions: [], aiSuggest: { isPending: false },
  kiBasis: { mode: "area", area: 0, hours: 32 / 60, hourlyRate: 38, floors: 4, floorRate: 8 / 60 * 38, pricePerSqm: 0, frequency: 1, frequencyUnit: "fortnight" },
  kiBillingPeriod: "month", kiPricingBasis: "floor", frequency: "1", frequencyUnit: "fortnight",
  kiItems: [{ id: "stair", description: "Treppenhausreinigung", quantity: "1", unit: "Monat", unit_price: "43,91" }],
  kiTotal: 43.91, kiItemChanged: false,
 } as unknown as KalkulationStateContext;
 const html = renderToStaticMarkup(createElement(SuggestedPositions, { state, direct: true }));
 expect(html).toContain("32 Minuten ÷ 60");
 expect(html).toContain("20,27");
 expect(html).not.toContain("weichen um mehr als 20 % ab");
});

it("bietet die Turnusauswahl auch an, wenn der Beschreibung die Häufigkeit fehlt", async () => {
  const prompt = "Treppenhausreinigung 4 Etagen plus 30 m² Flur";
  const result = await generateCalculation(prompt);
  expect(result.items).toEqual([]);
  const state = {
    aiReviewQuestions: result.review_questions,
    aiSuggest: { isPending: false, mutate: vi.fn() },
    kiPrompt: prompt,
    kiBasis: null,
    kiBillingPeriod: "month",
    frequency: "0",
    frequencyUnit: "month",
    kiItems: [],
    kiPositions: [],
    setFrequency: vi.fn(),
    setFrequencyUnit: vi.fn(),
  } as unknown as KalkulationStateContext;
  const html = renderToStaticMarkup(createElement(SuggestedPositions, { state }));
  expect(html).toContain("Reinigungsrhythmus festlegen");
  expect(html).toContain('id="ki-frequency"');
  expect(html).toContain("Mit diesem Rhythmus neu berechnen");
  const recalculated = await generateCalculation(prompt, { value: 1, unit: "fortnight" });
  expect(recalculated.review_questions).toEqual([]);
  expect(recalculated.items.map((i) => i.unit_price)).toEqual([108.33, 39]);
});

it.each([
  ["2x monatlich", 2, "month", 24, "2 Einsätze pro Monat"],
  ["alle 2 Wochen", 1, "fortnight", 26, "1 Einsatz alle 2 Wochen (14-tägig)"],
  ["1x wöchentlich", 1, "week", 52, "1 Einsatz pro Woche"],
] as const)(
  "zeigt bei %s den tatsächlichen Reinigungsrhythmus neben der Monatsabrechnung",
  async (rhythm, frequency, unit, annual, label) => {
    const result = await generateCalculation(
      `Treppenhausreinigung 4 Etagen ${rhythm} plus 30 m² Flur`,
    );
    const kiItems = result.items.map((item, index) => ({
      ...item,
      id: String(index),
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
    }));
    const state = {
      aiReviewQuestions: [],
      aiSuggest: { isPending: false, mutate: vi.fn() },
      kiBasis: { frequency: result.frequency, frequencyUnit: result.frequency_unit },
      frequency: String(result.frequency),
      frequencyUnit: result.frequency_unit,
      annualVisits: visitsPerYear(result.frequency, result.frequency_unit),
      visitsPerMonth: visitsPerMonth(result.frequency, result.frequency_unit),
      kiBillingPeriod: result.billing_period,
      kiPricingBasis: result.pricing_basis,
      kiItems,
      kiPositions: result.items,
      kiTotal: result.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
      area: "0",
      floors: "4",
      hours: "0",
      mode: "area",
      pricePerSqm: "0,6",
      setFrequency: vi.fn(),
      setFrequencyUnit: vi.fn(),
    } as unknown as KalkulationStateContext;
    const html = renderToStaticMarkup(createElement(SuggestedPositions, { state }));
    expect(html).toContain(`Berechneter Rhythmus: ${label}`);
    expect(html).toContain(`${annual} Einsätze pro Jahr`);
    expect(html).toContain(`id="ki-frequency"`);
    expect(html).toContain(`value="${frequency}"`);
    expect(html).toContain("Mit diesem Rhythmus neu berechnen");
    expect(html).toContain("Abrechnungsmenge");
    expect(html).toContain("Abrechnungseinheit");
    expect(html).toContain("Positionen bearbeiten");
    expect((html.match(/readonly=""/gi) ?? []).length).toBe(kiItems.length * 4);
    expect(html).toContain('aria-label="Leistungsbezeichnung"');
    expect(result.frequency_unit).toBe(unit);
  },
);

it("explains the actual 73.50 EUR analysis, not a later 49 EUR form value", async () => {
  const result = await generateCalculation("zwei hallereinigung ein mal im monat ca 210 m");
  const state = {
    aiReviewQuestions: [], aiSuggest: { isPending: false, mutate: vi.fn() },
    kiBasis: { type: result.cleaning_type, mode: result.mode, area: result.area_sqm,
      hours: result.hours, frequency: result.frequency, frequencyUnit: result.frequency_unit,
      pricePerSqm: result.price_per_sqm, hourlyRate: result.hourly_rate, floors: result.floors },
    frequency: "1", frequencyUnit: "month", annualVisits: 12, visitsPerMonth: 1,
    kiBillingPeriod: result.billing_period, kiPricingBasis: result.pricing_basis,
    kiItems: result.items.map((item, index) => ({ ...item, id: String(index), quantity: String(item.quantity), unit_price: String(item.unit_price) })),
    kiPositions: result.items, kiTotal: 73.5, kiItemChanged: false, kiBasisChanged: true,
    area: "210", mode: "area", hours: "0", hourlyRate: "35", pricePerSqm: String(35 / 150),
    setFrequency: vi.fn(), setFrequencyUnit: vi.fn(),
  } as unknown as KalkulationStateContext;
  const html = renderToStaticMarkup(createElement(SuggestedPositions, { state }));
  expect(html).toContain("0,35");
  expect(html).toContain("73,50");
  expect(html).not.toContain("49,00");
  expect(html).not.toContain("0,23");
  expect(html).toContain("die Kalkulation erneut erstellen");
});
