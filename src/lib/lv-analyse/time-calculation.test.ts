import { describe, expect, it } from "vitest";
import { validateItems } from "./validate";
import { normalizeItem } from "./normalize";
import {
  annualOfferPrice,
  canRelease,
  emptyCalculation,
  offerPrice,
  ownUnitPrice,
  pricingQuantity,
  summarizeOwnCalculation,
  updateLvItem,
} from "./calculation";
import { buildExportRows, EXPORT_HEADERS, selectExportItems } from "./export";
import { summarizeCost, summarizeHours } from "./aggregate";
import type { LvCalculation, LvNormalizedItem } from "./types";

function item(patch: Partial<LvCalculation> = {}): LvNormalizedItem {
  const source = normalizeItem(
    {
      description: "Türen reinigen",
      quantity: "5",
      unit: "Stück",
      frequency: "1 x pro Monat",
      source_page: 2,
      confidence_score: 1,
    },
    "ki",
  );
  return {
    ...source,
    calculation: {
      ...emptyCalculation(),
      mode: "time",
      scope_checked: true,
      pricing_basis: "execution",
      minutes_per_execution: 15,
      hourly_rate: 35,
      ...patch,
    },
  };
}

describe("LV-Zeitansatz unter Beibehaltung der Ausschreibungsmenge", () => {
  it("rechnet 15 Personalminuten für 5 Türen, nicht 15 Minuten pro Tür", () => {
    const row = item();
    expect(row.quantity).toBe(5);
    expect(row.unit).toBe("Stück");
    expect(ownUnitPrice(row)).toBe(1.75);
    expect(offerPrice(row)).toBe(8.75);
    expect(annualOfferPrice(row)).toBe(105);
    expect(canRelease(row)).toBe(true);
    expect(canRelease({ ...row, calculation: { ...row.calculation, scope_checked: false } })).toBe(
      false,
    );
  });
  it.each([
    ["execution", 8.75, 455],
    ["month", 37.92, 455.04],
    ["year", 455, 455],
    ["once", 8.75, 8.75],
  ] as const)("verwendet Preisbezug %s ohne doppelte Frequenz", (basis, price, annual) => {
    const row = item({
      pricing_basis: basis,
      own_frequency: { label: "wöchentlich", perYear: 52 },
    });
    expect(offerPrice(row)).toBe(price);
    expect(annualOfferPrice(row)).toBe(annual);
  });
  it("belässt Jahresmengen und direkte Jahres-Einheitspreise unverändert", () => {
    const row = {
      ...item({ mode: "unit_price", pricing_basis: "year", own_unit_price: 2 }),
      quantity: 260,
    };
    expect(offerPrice(row)).toBe(520);
    expect(annualOfferPrice(row)).toBe(520);
  });
  it("erfordert eigene Menge und Einheit nur bei fehlenden LV-Werten", () => {
    const missing = { ...item(), quantity: null, unit: "" };
    expect(offerPrice(missing)).toBeNull();
    expect(canRelease(missing)).toBe(false);
    const own = {
      ...missing,
      calculation: { ...missing.calculation, own_quantity: 1, own_unit: "pauschal" },
    };
    expect(offerPrice(own)).toBe(8.75);
    expect(canRelease(own)).toBe(true);
    expect(own.quantity).toBeNull();
    expect(own.unit).toBe("");
    expect(pricingQuantity(item({ own_quantity: 99 }))).toBe(5);
  });
  it("berechnet Material und Zuschläge je Ausführung genau einmal", () => {
    const row = item({ material_cost: 1, overhead_cost: 2, profit_percent: 20, labor_cost: 500 });
    expect(offerPrice(row)).toBe(14.1);
    expect(annualOfferPrice(row)).toBe(169.2);
  });
  it.each([
    { minutes_per_execution: 0 },
    { hourly_rate: -1 },
    { material_cost: -1 },
    { hourly_rate: Infinity },
    { pricing_basis: null },
  ])("blockiert ungültige Zeitkalkulation %j", (patch) => {
    const row = item(patch as Partial<LvCalculation>);
    expect(offerPrice(row)).toBeNull();
    expect(canRelease(row)).toBe(false);
  });
  it("verhindert Freigabe ohne erforderlichen Turnus, erlaubt bewussten Einmalpreis", () => {
    const row = { ...item(), frequency: { label: "", perYear: null } };
    expect(canRelease(row)).toBe(false);
    expect(
      offerPrice({ ...row, calculation: { ...row.calculation, pricing_basis: "month" } }),
    ).toBeNull();
    expect(canRelease({ ...row, calculation: { ...row.calculation, pricing_basis: "once" } })).toBe(
      true,
    );
  });
  it("widerruft Freigabe bei jeder Datenänderung und verhindert Export ungültiger Freigaben", () => {
    const row = { ...item(), approved: true };
    const updated = updateLvItem(row, {
      calculation: { ...row.calculation, minutes_per_execution: 30 },
    });
    expect(updated.approved).toBe(false);
    expect(selectExportItems([updated])).toEqual([]);
    const invalid = { ...row, quantity: null };
    expect(updateLvItem(invalid, { approved: true }).approved).toBe(false);
    expect(selectExportItems([invalid])).toEqual([]);
  });
  it("trennt einmaligen Gesamtpreis von monatlichen und jährlichen Summen", () => {
    const monthly = item({ pricing_basis: "month" });
    const once = item({ pricing_basis: "once" });
    const s = summarizeOwnCalculation([monthly, once]);
    expect(s.monthlyNet).toBe(8.75);
    expect(s.annualNet).toBe(105);
    expect(s.oneTimeNet).toBe(8.75);
    expect(summarizeCost([monthly, once], []).annualNet).toBe(105);
  });
  it("verwendet interne Zeit statt der pauschalen Flächenschätzung", () => {
    const row = { ...item(), area_m2: 100 };
    const s = summarizeHours([row]);
    expect(s.annualHoursTotal).toBe(3);
    expect(s.estimatedFromArea).toBe(0);
  });
  it("exportiert Quellwerte und eigene Kalkulation getrennt und vollständig", () => {
    const row = {
      ...item({ pricing_basis: "year", own_frequency: { label: "wöchentlich", perYear: 52 } }),
      approved: true,
    };
    const [exported] = buildExportRows([row]);
    expect(exported).toHaveLength(EXPORT_HEADERS.length);
    expect(exported![3]).toBe("5");
    expect(exported![4]).toBe("Stück");
    expect(exported![5]).toBe("1 x pro Monat");
    expect(exported![21]).toBe("Pro Jahr / Jahresmenge");
    expect(exported![23]).toBe("15");
    expect(exported![25]).toBe("wöchentlich");
    expect(exported![29]).toBe("455");
    expect(row.frequency.perYear).toBe(12);
  });
});

it("meldet einen vorhandenen eigenen Zeitpreis nicht weiter als fehlenden Dokumentpreis", () => {
  expect(validateItems([item()]).filter((issue) => issue.field === "unit_price")).toEqual([]);
});
