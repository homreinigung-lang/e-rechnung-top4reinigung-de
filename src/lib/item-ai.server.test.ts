import { describe, expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";
import { generateGeminiJson } from "./gemini-json.server";
import { normalizeItems, positionsTotal } from "./kalkulation-engine";
import { visitsPerYear, visitsPerMonth } from "./constants";

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
    ["2x monatlich", 2, "month", 24, 100, 36],
    ["alle 2 Wochen", 1, "fortnight", 26, 108.33, 39],
    ["14-tägig", 1, "fortnight", 26, 108.33, 39],
    ["1x wöchentlich", 1, "week", 52, 216.67, 78],
  ] as const)(
    "behält Anzahl und Zeitraum für %s bis zur Jahresmenge",
    async (rhythm, frequency, unit, annual, stairs, corridor) => {
      const result = await generateCalculation(
        `Treppenhausreinigung 4 Etagen ${rhythm} plus 30 m² Flur`,
      );
      expect(result.frequency).toBe(frequency);
      expect(result.frequency_unit).toBe(unit);
      expect(visitsPerYear(result.frequency, result.frequency_unit)).toBe(annual);
      expect(visitsPerMonth(result.frequency, result.frequency_unit)).toBeCloseTo(annual / 12);
      expect(result.items.map((i) => i.unit_price)).toEqual([stairs, corridor]);
      if (unit === "fortnight") expect(result.items[0]?.description).toContain("1× alle 2 Wochen");
    },
  );

  it.each([
    [2, "month", 100, 36],
    [1, "fortnight", 108.33, 39],
    [1, "week", 216.67, 78],
    [1, "quarter", 16.67, 6],
    [1, "year", 4.17, 1.5],
  ] as const)(
    "berechnet mit der expliziten Auswahl %s / %s statt dem alten Beschreibungsturnus",
    async (value, unit, stairs, corridor) => {
      const result = await generateCalculation(
        "Treppenhausreinigung 4 Etagen 2x monatlich plus 30 m² Flur",
        { value, unit },
      );
      expect(result.frequency).toBe(value);
      expect(result.frequency_unit).toBe(unit);
      expect(result.review_questions).toEqual([]);
      expect(result.items.map((i) => i.unit_price)).toEqual([stairs, corridor]);
    },
  );
  it.each([
    "Treppenhausreinigung 4 Etagen, zweimal monatlich, zusätzlich 30 m² Flur. Flurreinigung separat ausweisen und berechnen.",
    "Treppenhausreinigung 4 Etagen 2 mall monatlich mit Flur 30 qm",
    "Treppenhausreinigung 4 Etagen 2x monatlich plus Flurfläche von 30 m²",
  ])("trennt Etagen und zusätzliche Flurfläche in %s", async (prompt) => {
    const result = await generateCalculation(prompt);
    expect(result.review_questions).toEqual([]);
    expect(result.area_sqm).toBe(0);
    expect(result.floors).toBe(4);
    expect(result.pricing_basis).toBe("floor");
    expect(result.price_source).toBe("estimate");
    expect(result.items).toEqual([
      {
        description: "Treppenhausreinigung (4 Etagen, 2× monatlich)",
        quantity: 1,
        unit: "Monat",
        unit_price: 100,
      },
      {
        description: "Zusätzliche Flurreinigung (30 m², 2× monatlich)",
        quantity: 1,
        unit: "Monat",
        unit_price: 36,
      },
    ]);
    const positions = normalizeItems(result.items, { hourlyRate: 35, stairRate: 12.5, floors: 4 });
    expect(positionsTotal(positions)).toBe(136);
  });

  it("verwendet einen genannten m²-Preis nur für den zusätzlichen Flur", async () => {
    const result = await generateCalculation(
      "Treppenhausreinigung 4 Etagen 2x monatlich plus 30 m² Flur, 0,50 € pro m²",
    );
    expect(result.items.map((item) => item.unit_price)).toEqual([100, 30]);
    expect(result.price_source).toBe("stated");
  });

  it.each([
    ["Treppenhausreinigung 4 Etagen wöchentlich plus 30 m² Flur", 216.67, 78],
    ["Treppenhausreinigung 4 Etagen alle 2 Wochen plus 30 m² Flur", 108.33, 39],
    ["Treppenhausreinigung 4 Etagen einmalig plus 30 m² Flur", 50, 18],
  ] as const)(
    "berechnet beide Positionen mit demselben Turnus: %s",
    async (prompt, stairs, corridor) => {
      const result = await generateCalculation(prompt);
      expect(result.review_questions).toEqual([]);
      expect(result.items.map((item) => item.unit_price)).toEqual([stairs, corridor]);
    },
  );

  it.each([
    ["Treppenhausreinigung 4 Etagen 30 m² gesamt inklusive Flur, 2x monatlich", "treppenhaus", 36],
    ["Treppenhausreinigung 4 Etagen 30 m², 2x monatlich", "treppenhaus", 36],
    ["Treppenhausreinigung 4 Etagen 2x monatlich", "treppenhaus", 100],
    ["Büroreinigung 200 m² 2x monatlich mit Flur", "buero", 160],
    ["Treppenhausreinigung 2 Stunden pro Einsatz 2x monatlich", "treppenhaus", 140],
  ] as const)("behält die bisherige Einzelberechnung bei: %s", async (prompt, type, total) => {
    const result = await generateCalculation(prompt);
    expect(result.cleaning_type).toBe(type);
    expect(result.review_questions).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.unit_price).toBe(total);
  });

  it.each([
    "Treppenhausreinigung 4 Etagen plus 30 m² Flur",
    "Treppenhausreinigung 4 Etagen täglich plus 30 m² Flur",
    "Treppenhausreinigung 4 Etagen 2x monatlich plus Flur 30 m² 1x wöchentlich",
    "Treppenhausreinigung 4 Etagen 2x monatlich plus 30 m² Flur, 2 Stunden pro Einsatz",
  ])("fragt bei unklarem Umfang oder abweichendem Turnus nach: %s", async (prompt) => {
    const result = await generateCalculation(prompt);
    expect(result.items).toEqual([]);
    expect(result.review_questions.length).toBeGreaterThan(0);
  });

  it.each([
    ["Glas-Reinigung 80 m²", "glas", 112],
    ["Grund Reinigung 100 qm einmalig", "grund", 190],
    ["Bau Reinigung 150 qm", "bau", 390],
    ["Büroreinigung 200 qm, 3 Tage die Woche", "buero", 1040],
    ["Unterhaltsreinigung 120 m² 3/Woche", "unterhalt", 546],
    ["Praxisreinigung 200 qm, 3 pro Woche", "praxis", 1040],
    ["Praxisreinigung 200 qm, 3/Monat", "praxis", 240],
  ] as const)("verarbeitet %s bis zur Angebotsposition", async (prompt, type, total) => {
    const result = await generateCalculation(prompt);
    expect(result.cleaning_type).toBe(type);
    expect(result.review_questions).toEqual([]);
    const positions = normalizeItems(result.items, {
      hourlyRate: result.hourly_rate,
      stairRate: 12.5,
      floors: result.floors,
    });
    expect(positions).toHaveLength(1);
    expect(positionsTotal(positions)).toBe(total);
  });

  it.each([
    "Fensterreinigung 100 m², 2x jährlich",
    "Grundreinigung 100 qm einmal pro Jahr",
    "Treppenhausreinigung 3 Etagen halbjährlich",
  ])("fragt bei %s nach der Abrechnung statt einmalig zu kalkulieren", async (prompt) => {
    const result = await generateCalculation(prompt);
    expect(result.items).toEqual([]);
    expect(result.review_questions).toContain(
      "Jährlichen Turnus durch 'einmalig' je Einsatz ersetzen oder für eine Monatspauschale die Einsätze pro Monat angeben.",
    );
  });

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
