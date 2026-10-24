import { describe, expect, it } from "vitest";
import { normalizeItem } from "./normalize";
import { recommendPrice, summarizeArea, summarizeHours } from "./aggregate";
import { emptyCalculation } from "./calculation";
import type { LvNormalizedItem } from "./types";

function areaItem(): LvNormalizedItem {
  return {
    ...normalizeItem({ description: "Boden reinigen", quantity: "250", unit: "m²" }, "manuell"),
    area_m2: 250,
    working_hours: null,
    frequency: { label: "monatlich", perYear: 12 },
    calculation: {
      ...emptyCalculation(),
      pricing_basis: "month",
      own_frequency: { label: "wöchentlich", perYear: 52 },
    },
  };
}

describe("Geprüfter Turnus in der LV-Jahresauswertung", () => {
  it("verwendet den korrigierten Turnus für Jahresfläche, geschätzte Stunden und Preisempfehlung", () => {
    const row = areaItem();
    expect(summarizeArea([row]).annualArea).toBe(13000);
    expect(summarizeHours([row]).annualHoursTotal).toBe(52);
    expect(
      recommendPrice([row], {
        hourlyRate: 30,
        overheadPercent: 0,
        profitPercent: 0,
        performanceRate: 250,
      }).recommendedAnnualNet,
    ).toBe(1560);
    expect(row.frequency.perYear).toBe(12);
  });

  it("nimmt einmalige Leistungen nicht in jährliche Flächen und Stundenschätzungen auf", () => {
    const row = areaItem();
    row.calculation.pricing_basis = "once";
    expect(summarizeArea([row]).totalArea).toBe(250);
    expect(summarizeArea([row]).annualArea).toBe(0);
    expect(summarizeHours([row]).estimatedFromArea).toBe(0);
    expect(summarizeHours([row]).annualHoursTotal).toBe(0);
  });

  it("kennzeichnet nur wiederkehrende Positionen ohne geprüften Turnus", () => {
    const checked = areaItem();
    checked.frequency = { label: "", perYear: null };
    const once = areaItem();
    once.frequency = { label: "", perYear: null };
    once.calculation.own_frequency = undefined;
    once.calculation.pricing_basis = "once";
    const missing = {
      ...once,
      calculation: { ...once.calculation, pricing_basis: "month" as const },
    };
    expect(summarizeHours([checked, once]).itemsWithoutFrequency).toBe(0);
    expect(summarizeHours([checked, once, missing]).itemsWithoutFrequency).toBe(1);
  });
});
