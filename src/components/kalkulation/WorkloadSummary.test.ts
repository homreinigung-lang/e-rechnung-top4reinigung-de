import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkloadSummary } from "./WorkloadSummary";
import type { KalkulationStateContext } from "./useKalkulationState";
function summary(patch: Partial<KalkulationStateContext> = {}) {
 return renderToStaticMarkup(createElement(WorkloadSummary, { state: {
  mode: "area", type: "glas", area: "900", glassArea: "160", hours: "", hourlyRate: "40",
  selectedPerformanceRate: { sqm_per_hour: 80 }, monthlyHours: 8, frequencyUnit: "month",
  suggested: 320, vatRate: 19, ...patch,
 } as unknown as KalkulationStateContext }));
}
describe("live time, hourly rate and total", () => {
 it("shows glass workload, entered hourly rate, net, VAT and gross for the same billing period", () => {
  const html = summary();
  for (const text of ["2 Std.", "8 Std.", "40,00", "320,00", "60,80", "380,80", "pro Monat"]) expect(html).toContain(text);
 });
 it("shows manually corrected time and updated totals", () => {
  const html = summary({ mode: "hours", hours: "3,5", monthlyHours: 14, suggested: 560 });
  for (const text of ["3,5 Std.", "14 Std.", "560,00", "106,40", "666,40"]) expect(html).toContain(text);
 });
 it("shows one-off totals and the selected tax rate", () => {
  const html = summary({ frequencyUnit: "once", monthlyHours: 2, suggested: 80, vatRate: 0 });
  expect(html).toContain("einmaliger Auftrag");
  expect(html).toContain("Umsatzsteuer (0 %)");
  expect(html).not.toContain("pro Monat");
 });
});