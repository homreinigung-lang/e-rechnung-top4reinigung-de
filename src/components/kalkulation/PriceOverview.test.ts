import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PriceOverview } from "./PriceOverview";
it("offers all price choices and requires an explicit confirmation", () => {
 const choose = vi.fn();
 const html = renderToStaticMarkup(createElement(PriceOverview, { oneTime: false, minimum: 50.8, recommended: 63.5, customer: 80, onConfirmChoice: choose }));
 expect(html).toContain("Mindestpreis (Kosten)");
 expect(html).toContain("Empfohlener Preis (Ziel)");
 expect(html).toContain("Kundenpreis nach Rabatt");
 expect(html).toContain("Preisauswahl bestätigen");
 expect(html).toContain("63,50");
 expect(html).toContain("auswählen und anschließend bestätigen");
 expect(choose).not.toHaveBeenCalled();
});
it("leaves the recommendation read-only when selection is unavailable", () => {
 const html = renderToStaticMarkup(createElement(PriceOverview, { oneTime: true, minimum: 50.8, recommended: 63.5, customer: 80 }));
 expect(html).not.toContain("Preisauswahl bestätigen");
 expect(html).toContain("je Auftrag");
});