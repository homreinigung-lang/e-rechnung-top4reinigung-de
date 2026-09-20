import { describe, expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
import { generateGeminiJson } from "./gemini-json.server";

vi.mock("./gemini-json.server", () => ({
  generateGeminiJson: vi.fn(async () => ({
    cleaning_type: "buero",
    mode: "hours",
    area_sqm: 200,
    hours: 21.65,
    hourly_rate: 35,
    price_per_sqm: 0.4,
    frequency: 5,
    frequency_unit: "week",
    floors: 1,
    stairs: false,
    travel: 0,
    note: "",
    items: [
      {
        description: "Unterhaltsreinigung Praxisfläche",
        quantity: 21.65,
        unit: "Std.",
        unit_price: 35,
      },
    ],
  })),
}));

describe("KI-Kalkulation für Praxisreinigung", () => {
  it.each([
    ["Praxisreinigung, 200 qm, 3-mal pro Woche", "week", 3, 1040],
    ["Praxisreinigung, 200 qm, 3 Mal pro Woche", "week", 3, 1040],
    ["Praxisreinigung, 200 qm, 3x/Woche", "week", 3, 1040],
    ["Praxisreinigung, 200 qm, dreimal wöchentlich", "week", 3, 1040],
    ["Praxisreinigung, 200 qm, 3-mal die Woche", "week", 3, 1040],
    ["Praxisreinigung, 200 qm, 3-mal im Monat", "month", 3, 240],
  ] as const)("versteht den Turnus in %s", async (prompt, unit, frequency, monthlyPrice) => {
    const result = await generateCalculation(prompt);
    expect(result.frequency).toBe(frequency);
    expect(result.frequency_unit).toBe(unit);
    expect(result.review_questions).toEqual([]);
    expect(result.items[0]?.unit_price).toBe(monthlyPrice);
  });

  it("berechnet die Eingabe aus dem Screenshot auch ohne verwertbare KI-Antwort", async () => {
    const gemini = vi.mocked(generateGeminiJson);
    gemini.mockClear();
    const result = await generateCalculation(
      "erstellen angebot praxis reinigung 200 qm 3 mal in der woche",
    );
    expect(result.cleaning_type).toBe("praxis");
    expect(result.area_sqm).toBe(200);
    expect(result.frequency).toBe(3);
    expect(result.frequency_unit).toBe("week");
    expect(result.review_questions).toEqual([]);
    expect(result.items).toEqual([expect.objectContaining({ unit: "Monat", unit_price: 1040 })]);
    expect(gemini).not.toHaveBeenCalled();
  });

  it("fragt bei täglicher Reinigung ohne Arbeitstage nach und übernimmt keine erfundene Monatsposition", async () => {
    const result = await generateCalculation("Praxisreinigung, 200 qm, täglich");
    expect(result.cleaning_type).toBe("praxis");
    expect(result.frequency).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.review_questions).toHaveLength(1);
    expect(result.items).toEqual([]);
  });

  it("ignoriert einen vom Modell geratenen Turnus bei fehlender Angabe", async () => {
    const result = await generateCalculation("Praxisreinigung, 200 qm");
    expect(result.frequency).toBe(0);
    expect(result.review_questions).toContain(
      "Wie viele Einsätze pro Woche oder Monat sind vorgesehen?",
    );
    expect(result.items).toEqual([]);
  });

  it("berechnet bei ausdrücklich genannten fünf Tagen die monatliche Basis aus Einsätzen", async () => {
    const result = await generateCalculation(
      "Praxisreinigung 200 m², täglich Montag bis Freitag, 2 Stunden pro Einsatz",
    );
    expect(result.frequency).toBe(5);
    expect(result.frequency_unit).toBe("week");
    expect(result.hours).toBe(2);
    expect(result.review_questions).toEqual([]);
    expect(result.items).toEqual([
      expect.objectContaining({
        description: expect.stringContaining("Praxisreinigung"),
        quantity: 1,
        unit: "Monat",
        unit_price: 1733.33,
      }),
    ]);
  });
});

describe("KI-Kalkulation nach Auftragsart", () => {
  it.each([
    ["Büroreinigung 200 m², 2x wöchentlich", "buero", "month", 693.33],
    ["Unterhaltsreinigung 120 qm, zweimal pro Woche", "unterhalt", "month", 364],
    ["Grundreinigung 100 m² einmalig", "grund", "once", 190],
    ["Bauendreinigung 150 qm", "bau", "once", 390],
    ["Glasreinigung 80 m²", "glas", "once", 112],
    ["Treppenhausreinigung 3 Etagen, 2x monatlich", "treppenhaus", "month", 75],
    ["Büroreinigung 200 m², alle 2 Wochen", "buero", "month", 173.33],
    ["Praxisreinigung 2 Stunden pro Einsatz, 5 Tage pro Woche", "praxis", "month", 1516.67],
    ["Einmalige Büroreinigung 100 qm", "buero", "once", 40],
    ["Wohnungsreinigung 110 m² einmalig", "wohn", "once", 44],
    ["Fensterreinigung 3 Stunden, 40 € pro Std.", "glas", "once", 120],
    ["Unterhaltsreinigung 2 Std pro Einsatz, 2x pro Woche", "unterhalt", "month", 606.67],
    ["Grundreinigung 100 m², einmal pro Monat", "grund", "month", 190],
    ["Büroreinigung 1.200 m², einmalig", "buero", "once", 480],
    ["Praxisreinigung 200 m² täglich Mo-Sa", "praxis", "month", 2080],
  ] as const)("berechnet %s", async (prompt, type, period, expected) => {
    const result = await generateCalculation(prompt);
    expect(result.cleaning_type).toBe(type);
    expect(result.billing_period).toBe(period);
    expect(result.review_questions).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.unit_price).toBe(expected);
    expect(result.items[0]?.unit).toBe(period === "once" ? "Pauschal" : "Monat");
  });

  it("verlangt eine Reinigungsart und eine belastbare Menge, statt KI-Zahlen zu übernehmen", async () => {
    const result = await generateCalculation("Bitte täglich reinigen");
    expect(result.items).toEqual([]);
    expect(result.review_questions).toHaveLength(3);
    expect(result.area_sqm).toBe(0);
    expect(result.hours).toBe(0);
  });

  it("verwendet ausdrücklich vereinbarte Preise und trennt zusätzliche Leistungen", async () => {
    const result = await generateCalculation(
      "Büroreinigung 200 m² 5x pro Woche 0,50 € pro m², Fensterreinigung zusätzlich",
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.unit_price).toBe(2166.67);
    expect(result.price_source).toBe("stated");
    expect(result.review_notes).toContain(
      "Fenster/Glas ist eine weitere Leistung: Umfang und Turnus gesondert kalkulieren.",
    );
  });

  it("verlangt Angaben zu mehrdeutigen Arbeitstagen und übernimmt keine geratenen Positionen", async () => {
    const result = await generateCalculation("Wohnungsreinigung 110 qm täglich");
    expect(result.review_questions).toContain(
      "An welchen Tagen wird gereinigt: Montag bis Freitag, sieben Tage oder ein anderer Turnus?",
    );
    expect(result.items).toEqual([]);
  });

  it("führt eine ausdrücklich genannte Zusatzleistung nicht doppelt als Grundposition auf", async () => {
    const result = await generateCalculation(
      "Büroreinigung 200 m² 2x pro Woche mit Treppenhausreinigung",
    );
    expect(result.cleaning_type).toBe("buero");
    expect(result.items).toHaveLength(1);
    expect(result.review_notes.some((note) => note.includes("Treppenhaus"))).toBe(true);
  });
});
