import { describe, expect, it } from "vitest";
import { formatMoney, roundCents } from "@/lib/format";

/** Gleiche Rechenkette wie im Belegeditor (Datenbank = UI = PDF). */
function totals(
  items: { quantity: number; unitPrice: number }[],
  discountPercent: number,
  vatRate: number,
) {
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmount = roundCents((itemsTotal * discountPercent) / 100);
  const netTotal = roundCents(itemsTotal - discountAmount);
  const vatAmount = roundCents((netTotal * vatRate) / 100);
  const grossTotal = roundCents(netTotal + vatAmount);
  return { netTotal, vatAmount, grossTotal, discountAmount };
}

describe("Belegsummen", () => {
  it("rundet auf volle Cent – Netto + MwSt. = Brutto", () => {
    const t = totals([{ quantity: 3, unitPrice: 33.333 }], 0, 19);
    expect(t.netTotal).toBe(100);
    expect(t.vatAmount).toBe(19);
    expect(t.grossTotal).toBe(119);
    expect(roundCents(t.netTotal + t.vatAmount)).toBe(t.grossTotal);
  });

  it("bleibt bei Rabatt und krummen Preisen konsistent", () => {
    const t = totals(
      [
        { quantity: 7, unitPrice: 12.99 },
        { quantity: 1.5, unitPrice: 47.35 },
      ],
      7.5,
      19,
    );
    expect(roundCents(t.netTotal + t.vatAmount)).toBe(t.grossTotal);
    // Angezeigte Werte entsprechen exakt den gespeicherten Werten.
    expect(formatMoney(t.grossTotal)).toBe(formatMoney(t.netTotal + t.vatAmount));
  });

  it("weist bei 0 % MwSt. (Reverse-Charge / § 19 UStG) keine Steuer aus", () => {
    const t = totals([{ quantity: 2, unitPrice: 199.99 }], 0, 0);
    expect(t.vatAmount).toBe(0);
    expect(t.grossTotal).toBe(t.netTotal);
  });

  it("verkraftet 0 Positionen", () => {
    const t = totals([], 10, 19);
    expect(t).toEqual({ netTotal: 0, vatAmount: 0, grossTotal: 0, discountAmount: 0 });
  });
});
