import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PriceOverview } from "./PriceOverview";
it("offers an explicit recommended-price choice without applying it on render", () => {
 const choose = vi.fn();
 const html = renderToStaticMarkup(createElement(PriceOverview, { oneTime: false, minimum: 50.8, recommended: 63.5, customer: 80, onSelectRecommended: choose }));
 expect(html).toContain("Empfohlenen Preis übernehmen");
 expect(html).toContain("63,50");
 expect(html).toContain("frei korrigierbar");
 expect(choose).not.toHaveBeenCalled();
});
it("leaves the recommendation read-only when selection is unavailable", () => {
 const html = renderToStaticMarkup(createElement(PriceOverview, { oneTime: true, minimum: 50.8, recommended: 63.5, customer: 80 }));
 expect(html).not.toContain("Empfohlenen Preis übernehmen");
 expect(html).toContain("je Auftrag");
});