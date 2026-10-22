import { describe, expect, it } from "vitest";
import { calculationTransfer, type CalculationWorkflow } from "./calculation-transfer";
import { buildDiscountPosition, type CalcPosition } from "./kalkulation-engine";
import { computeDocumentTotals } from "./document-totals";

const calculated: CalcPosition[] = [
  { description: "Reinigung", quantity: 150, unit: "m²", unit_price: 1.3 },
  { description: "Anfahrt", quantity: 1, unit: "Pauschal", unit_price: 15 },
];
const ai = [{ description: "KI-Leistung", quantity: 1, unit: "Monat", unit_price: 350 }];
const lv = [{ description: "Manuelle Position", quantity: 2, unit: "Std.", unit_price: 40 }];
const input = {
  workflow: "schnell" as CalculationWorkflow, calculated, ai, lv,
  roomEnabled: true, aiStale: false, aiQuestions: [] as string[], warnings: [] as string[], frequency: 1,
};

describe("independent calculation transfer", () => {
  it("transfers the 210 EUR quick calculation even when LV is empty", () => {
    const result = calculationTransfer({ ...input, roomEnabled: false, lv: [] });
    expect(result.positions).toBe(calculated);
    expect(result.total).toBe(210);
    expect(result.issues).toEqual([]);
  });
  it.each([
    ["schnell", 210], ["raum", 210], ["ki", 350], ["ausschreibung", 80],
  ] as const)("uses only the source for %s", (workflow, total) => {
    const result = calculationTransfer({ ...input, workflow });
    expect(result.total).toBe(total);
    expect(result.issues).toEqual([]);
    // Repeated previews never append positions or modify another source.
    expect(calculationTransfer({ ...input, workflow })).toEqual(result);
    expect(calculated).toHaveLength(2);
    expect(lv).toHaveLength(1);
  });
  it("does not fall back to a default quick price when room or AI data is missing", () => {
    expect(calculationTransfer({ ...input, workflow: "raum", roomEnabled: false }).issues).not.toEqual([]);
    expect(calculationTransfer({ ...input, workflow: "ki", ai: [] }).issues).not.toEqual([]);
    expect(calculationTransfer({ ...input, workflow: "ausschreibung", lv: [] }).total).toBe(0);
  });
  it("blocks incomplete and outdated AI suggestions", () => {
    expect(calculationTransfer({ ...input, workflow: "ki", aiStale: true }).issues).not.toEqual([]);
    expect(calculationTransfer({ ...input, workflow: "ki", aiQuestions: ["Turnus?"] }).issues).not.toEqual([]);
  });
  it("preserves an explicit discount and computes the same net/VAT as the document editor", () => {
    const discount = buildDiscountPosition(calculated, { percent: 10, amount: 0, reason: "Treuerabatt" });
    const result = calculationTransfer({ ...input, calculated: [...calculated, discount!] });
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(189);
    expect(computeDocumentTotals(result.positions, 0, 19)).toMatchObject({ netTotal: 189, vatAmount: 35.91, grossTotal: 224.91 });
    expect(computeDocumentTotals(result.positions, 0, 0).grossTotal).toBe(189);
  });
  it("blocks invalid quantities, missing visits, and plausibility errors", () => {
    expect(calculationTransfer({ ...input, calculated: [{ ...calculated[0]!, quantity: -1 }] }).issues).not.toEqual([]);
    expect(calculationTransfer({ ...input, roomEnabled: false, frequency: 0 }).issues).not.toEqual([]);
    expect(calculationTransfer({ ...input, warnings: ["Raumdaten fehlen"] }).issues).toContain("Raumdaten fehlen");
  });
});
