import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CalculationTransfer } from "./CalculationTransfer";
import type { KalkulationStateContext } from "./useKalkulationState";

function render(issues: string[] = [], confirmed = true) {
  return renderToStaticMarkup(createElement(CalculationTransfer, {
    workflow: "schnell",
    state: {
      transfer: { positions: [{ description: "Reinigung inkl. Anfahrt", quantity: 1, unit: "Pauschal", unit_price: 210 }], total: 210, issues },
      transferConfirmed: confirmed, setTransferConfirmed: vi.fn(), vatRate: 19,
      toQuote: { isPending: false, mutate: vi.fn() },
    } as unknown as KalkulationStateContext,
  }));
}

it("shows the actual source positions, 210 EUR and matching VAT instead of an empty LV", () => {
  const html = render();
  expect(html).toContain("Quelle: Schnellkalkulation");
  expect(html).toContain("210,00");
  expect(html).toContain("39,90");
  expect(html).toContain("249,90");
  expect(html).toContain("Reinigung inkl. Anfahrt");
  expect(html).not.toContain('disabled=""');
});

it("disables transfer without review or while inputs need correction", () => {
  expect(render([], false)).toContain('disabled=""');
  expect(render(["Bitte Turnus ergänzen"])).toContain('disabled=""');
  expect(render(["Bitte Turnus ergänzen"])).toContain("Bitte Turnus ergänzen");
});
