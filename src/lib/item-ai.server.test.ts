import { describe, expect, it, vi } from "vitest";
import { generateCalculation } from "./item-ai.server";

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
        quantity: 21.67,
        unit: "Einsatz",
        unit_price: 80,
      }),
    ]);
  });
});
