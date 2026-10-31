import { describe, expect, it } from "vitest";
import { CLEANING_TYPES } from "@/components/kalkulation/shared";
import { buildConsolidatedPositions, isGlassText, normalizeItems, positionsTotal } from "./kalkulation-engine";
import { quoteClosingFor, quoteIntroFor, serviceKeysFromTexts } from "./quote-templates";
import { resolveIntroText, resolveQuoteNotes, paymentTermsLine, ORDER_INTRO } from "./document-texts";

const base = {
  typeValue: "unterhalt", typeLabel: "Unterhaltsreinigung",
  mode: "area" as const, areaSqm: 100, pricePerSqm: 1.2,
  hours: 0, hourlyRate: 35, visitsPerMonth: 52 / 12,
  stairs: false, floors: 0, stairRate: 0, hasLift: false, liftRate: 0,
  extras: [], travel: 0, discountPercent: 0, discountReason: "",
};
describe("monatliche Kalkulation", () => {
  it.each([["wöchentlich", 52 / 12], ["14-tägig", 26 / 12], ["monatlich", 1], ["vierteljährlich", 1 / 3], ["jährlich", 1 / 12]])(
    "%s bleibt nach Übernahme centgenau", (_, visits) => {
      const positions = buildConsolidatedPositions({ ...base, visitsPerMonth: visits });
      const copied = positions.map((p) => ({ quantity: Number(p.quantity.toFixed(2)), unit_price: Number(p.unit_price.toFixed(2)) }));
      expect(positionsTotal(copied)).toBe(positionsTotal(positions));
    },
  );
  it("100 m² × 1,20 € × 52/12 = 520,00 €", () => {
    const positions = buildConsolidatedPositions(base);
    expect(positions[0]).toMatchObject({ quantity: 1, unit: "Monat", unit_price: 520 });
    expect(positionsTotal(positions)).toBe(520);
  });
  it("schließt Fensterbänke aus Glaspreis-Erkennung aus", () => {
    expect(isGlassText("Fensterbänke reinigen")).toBe(false);
    expect(isGlassText("Fensterreinigung")).toBe(true);
  });
  it("behält Rabattvorzeichen und verwirft ungültige Mengen", () => {
    const positions = normalizeItems([
      { description: "Rabatt", quantity: 1, unit: "Pauschal", unit_price: -10 },
      { description: "Ungültig", quantity: 0, unit: "Std.", unit_price: 35 },
    ], { hourlyRate: 35, stairRate: 5, floors: 1 });
    expect(positions).toHaveLength(1);
    expect(positions[0]?.unit_price).toBe(-10);
  });
});
describe("Angebotstexte", () => {
  it("fügt den Standard-Schlusstext nur einmal hinzu", () => {
    const first = resolveQuoteNotes("Individuelle Bemerkung", ["glas"]);
    expect(resolveQuoteNotes(first, ["glas"])).toBe(first);
    expect(first).toContain("Individuelle Bemerkung");
  });
  it("unterscheidet Zahlungsziel von Rechnung und Angebot", () => {
    expect(paymentTermsLine("invoice", 14)).toContain("Überweisung");
    expect(paymentTermsLine("quote", 14)).toContain("nach Rechnungsstellung");
  });
  it.each(CLEANING_TYPES)("erkennt das echte Label $label", ({ value, label }) => {
    expect(serviceKeysFromTexts([`${label} – 100 m² Reinigung`])).toEqual([value]);
  });
  it("erkennt nur die Leistungsart, nicht beiläufige Fenster", () => {
    expect(serviceKeysFromTexts(["Büroreinigung – Fensterbänke abwischen"])).toEqual(["buero"]);
  });
  it("kombiniert ohne Preise", () => {
    const intro = quoteIntroFor(["buero", "glas"], { companyName: "Muster GmbH" });
    const closing = quoteClosingFor(["buero", "glas"]);
    expect(intro).toContain("Büroräume");
    expect(intro).toContain("Glasflächen");
    expect(intro).not.toMatch(/\d+\s*€/);
    expect(closing).not.toMatch(/\d+\s*€/);
  });
  it("zeigt bei Auftrag immer Auftragsbestätigung und eigene Ergänzung", () => {
    expect(resolveIntroText("order", { introText: "Eigene Ergänzung", isPrivat: false })).toBe(`${ORDER_INTRO}\n\nEigene Ergänzung`);
  });
});
