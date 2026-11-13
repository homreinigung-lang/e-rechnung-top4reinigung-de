import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CalculationExamples } from "./CalculationExamples";
import { CALCULATION_EXAMPLES } from "@/lib/calculation-examples";
it("offers practical examples without injecting a customer selling price", () => {
 const html = renderToStaticMarkup(createElement(CalculationExamples, { onSelect: vi.fn() }));
 for (const example of CALCULATION_EXAMPLES) {
   expect(html).toContain(example.label);
   expect(example.prompt).not.toMatch(/€|eur|euro/i);
 }
 expect(html).toContain("den Verkaufspreis legen Sie selbst fest");
});
it("disables example replacement during a running analysis", () => {
 const html = renderToStaticMarkup(createElement(CalculationExamples, { disabled: true, onSelect: vi.fn() }));
 expect((html.match(/disabled=""/g) ?? []).length).toBe(CALCULATION_EXAMPLES.length);
});
