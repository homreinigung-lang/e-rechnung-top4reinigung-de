import { describe, expect, it } from "vitest";
import { visitsPerMonth, visitsPerYear } from "@/lib/constants";

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
