import { describe, expect, it } from "vitest";
import { visitsPerMonth, visitsPerYear } from "@/lib/constants";
import { buildConsolidatedPositions, positionsTotal } from "@/lib/kalkulation-engine";

describe("Turnusberechnung auf Jahresbasis", () => {
  it("rechnet wöchentlich mit exakt 52 Wochen pro Jahr", () => {
    expect(visitsPerYear(1, "week")).toBe(52);
    expect(visitsPerMonth(1, "week")).toBeCloseTo(52 / 12, 10);
  });

  it("rechnet 14-tägig mit exakt 26 Einsätzen pro Jahr", () => {
    expect(visitsPerYear(1, "fortnight")).toBe(26);
    expect(visitsPerMonth(1, "fortnight")).toBeCloseTo(26 / 12, 10);
  });

  it("unterstützt Monats-, Quartals- und Jahresturnus ohne 4-Wochen-Näherung", () => {
    expect(visitsPerYear(1, "month")).toBe(12);
    expect(visitsPerMonth(1, "month")).toBe(1);
    expect(visitsPerYear(1, "quarter")).toBe(4);
    expect(visitsPerMonth(1, "quarter")).toBeCloseTo(4 / 12, 10);
    expect(visitsPerYear(1, "year")).toBe(1);
    expect(visitsPerMonth(1, "year")).toBeCloseTo(1 / 12, 10);
  });
});


describe("Angebotspreis mit exakter Einsatzmenge", () => {
  it("berechnet 14-tägig mit 1,5 Std. × 35 € als 113,75 € pro Monat", () => {
    const monthlyVisits = visitsPerMonth(1, "fortnight");
    const positions = buildConsolidatedPositions({
      typeValue: "unterhalt",
      typeLabel: "Unterhaltsreinigung",
      mode: "hours",
      areaSqm: 0,
      pricePerSqm: 0,
      hours: 1.5,
      hourlyRate: 35,
      visitsPerMonth: monthlyVisits,
      stairs: false,
      floors: 0,
      stairRate: 0,
      hasLift: false,
      liftRate: 0,
      extras: [],
      travel: 0,
      discountPercent: 0,
      discountReason: "",
    });
    expect(positionsTotal(positions)).toBe(113.75);
  });
});
