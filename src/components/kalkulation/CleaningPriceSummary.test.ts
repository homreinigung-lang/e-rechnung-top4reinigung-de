import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CleaningPriceSummary } from "./CleaningPriceSummary";

it.each([["35", "14,00"], ["40", "16,00"], ["31,75", "12,70"]])(
  "uses the chosen hourly rate %s for a 24-minute visit",
  (hourlyRate, expected) => {
    const html = renderToStaticMarkup(createElement(CleaningPriceSummary, {
      hours: 0.4,
      state: { mode: "hours", type: "treppenhaus", area: "", pricePerSqm: "", hourlyRate, selfCostPerHour: 25.4, targetSellingRate: 31.75 },
    }));
    expect(html).toContain(`Reinigungspreis je Einsatz (netto): <strong>${expected}`);
    expect(html).toContain("Unverbindliche Preisempfehlung: 12,70");
    expect(html).toContain("Selbstkosten Reinigung: 10,16");
    expect(html).toContain("Anfahrt, Zusatzleistungen und Rabatt");
  },
);

it("respects area pricing when selected in Leistungsdaten", () => {
  const html = renderToStaticMarkup(createElement(CleaningPriceSummary, {
    hours: 0.4,
    state: { mode: "area", type: "treppenhaus", area: "48", pricePerSqm: "0,6", hourlyRate: "35", selfCostPerHour: 25.4, targetSellingRate: 31.75 },
  }));
  expect(html).toContain("Reinigungspreis je Einsatz (netto): <strong>28,80");
  expect(html).toContain("Gewählter Flächenpreis: 0,60");
});
