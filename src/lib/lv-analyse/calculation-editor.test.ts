import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LvCalculationEditor } from "@/components/lv-analyse/positions/LvCalculationEditor";
import { normalizeItem } from "./normalize";
import { emptyCalculation } from "./calculation";

it("zeigt auf Mobilgeräten dieselben Kalkulationsfelder und lässt die Quellmenge unverändert", () => {
  const item = normalizeItem(
    {
      item_number: "10",
      description: "Türen",
      quantity: "5",
      unit: "Stück",
      frequency: "1 x pro Monat",
    },
    "test",
  );
  item.calculation = {
    ...emptyCalculation(),
    mode: "time",
    pricing_basis: "execution",
    minutes_per_execution: 15,
    hourly_rate: 35,
  };
  const html = renderToStaticMarkup(
    createElement(LvCalculationEditor, { item, onChange: () => undefined }),
  );
  expect(html).toContain("Personalminuten für die gesamte Position");
  expect(html).toContain("Preisbezug laut Ausschreibung");
  expect(html).toContain("LV-Menge unverändert");
  expect(html).toContain("8,75");
  expect(html).toContain("Leistungsumfang geprüft");
  expect(html).not.toContain("Eigene Menge (im LV nicht angegeben)");
  expect(item.quantity).toBe(5);
});
