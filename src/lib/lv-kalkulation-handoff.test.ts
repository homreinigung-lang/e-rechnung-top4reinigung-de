import { describe, expect, it } from "vitest";
import { buildLvKalkulationHandoff } from "@/lib/lv-kalkulation-handoff";
import { emptyCalculation } from "@/lib/lv-analyse/calculation";
import type { LvNormalizedItem } from "@/lib/lv-analyse/types";

function item(overrides: Partial<LvNormalizedItem>): LvNormalizedItem {
  return {
    id: "1",
    analysis_id: "analysis",
    item_number: "1.01",
    description: "Unterhaltsreinigung",
    category: "unterhaltsreinigung",
    quantity: 10,
    unit: "m²",
    frequency: { label: "5x wöchentlich", perYear: 260 },
    area_m2: 10,
    working_hours: null,
    unit_price: null,
    total_price: null,
    vat_rate: 19,
    source_page: 1,
    confidence_score: 1,
    source_method: "manuell",
    calculation: { ...emptyCalculation(), own_unit_price: 2 },
    approved: true,
    ...overrides,
  };
}

describe("LV to calculation handoff", () => {
  it("transfers only approved, calculable positions", () => {
    const payload = buildLvKalkulationHandoff("ausschreibung.pdf", [
      item({ id: "approved" }),
      item({ id: "not-approved", approved: false }),
      item({
        id: "without-price",
        calculation: emptyCalculation(),
      }),
    ]);

    expect(payload.sourceFile).toBe("ausschreibung.pdf");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      description: "Unterhaltsreinigung",
      quantity: 10,
      unit: "m²",
      sourceItemNumber: "1.01",
      frequencyLabel: "5x wöchentlich",
    });
  });

  it("uses the calculated offer total as effective unit price", () => {
    const payload = buildLvKalkulationHandoff("lv.pdf", [
      item({
        quantity: 4,
        calculation: {
          own_unit_price: 10,
          labor_cost: 20,
          material_cost: 0,
          overhead_cost: 0,
          profit_percent: 0,
        },
      }),
    ]);

    // (4 × 10 + 20) / 4 = 15 effective EUR per unit.
    expect(payload.items[0]?.unitPrice).toBe(15);
  });
});
