import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CalculationBasis } from "./CalculationBasis";
import type { KalkulationStateContext } from "./useKalkulationState";

it("shows every saved performance value, including central services after the first four rows", () => {
  const rates = ["Büro", "Flur", "Küche", "Lager", "Unterhaltsreinigung", "Glasreinigung"].map((label, i) => ({
    id: String(i), label, sqm_per_hour: 100 + i, usage_type: label, floor_covering: "", active: true,
  }));
  const state = { laborWage: "20", laborBurdenPercent: "30", materialCost: "2", overheadCost: "4", profitMarkup: "25",
    selfCostPerHour: 32, laborBurdenPerHour: 6, visiblePerformanceRates: rates } as KalkulationStateContext;
  const html = renderToStaticMarkup(createElement(CalculationBasis, { state }));
  for (const rate of rates) expect(html).toContain(rate.label);
  expect(html).toContain("105 m²/h");
});
