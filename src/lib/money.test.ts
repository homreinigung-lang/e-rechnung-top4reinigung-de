import { describe, expect, it } from "vitest";
import { roundCents, toCents } from "./money";
import { computeDocumentTotals } from "./document-totals";

describe("Kaufmännische Rundung an halben Cent", () => {
  it.each([
    [162.015, 162.02],
    [1.005, 1.01],
    [2.675, 2.68],
    [1234.565, 1234.57],
    [999.995, 1000],
    [-162.015, -162.02],
    [-1.005, -1.01],
  ])("rundet %s symmetrisch auf %s Euro", (input, expected) => {
    expect(roundCents(input)).toBe(expected);
  });
  it("unterstützt kleine Exponentialzahlen und ungültige Werte", () => {
    expect(toCents(5e-3)).toBe(1);
    expect(toCents(5e-7)).toBe(0);
    expect(toCents(NaN)).toBe(0);
    expect(toCents(Infinity)).toBe(0);
  });
  it("unterscheidet präzise Einsatzpreise von bewusst auf Cent gerundeten Einsatzpreisen", () => {
    const make = (sunday: number) =>
      computeDocumentTotals(
        [
          { quantity: 1, unit_price: 16128 },
          { quantity: 10, unit_price: 112 },
          { quantity: 20, unit_price: sunday },
          { quantity: 1, unit_price: 858 },
          { quantity: 10, unit_price: 32 },
        ],
        0,
        19,
      );
    expect(make(162.015)).toMatchObject({
      netTotal: 21666.3,
      vatAmount: 4116.6,
      grossTotal: 25782.9,
    });
    expect(make(roundCents(162.015))).toMatchObject({
      netTotal: 21666.4,
      vatAmount: 4116.62,
      grossTotal: 25783.02,
    });
  });
});
