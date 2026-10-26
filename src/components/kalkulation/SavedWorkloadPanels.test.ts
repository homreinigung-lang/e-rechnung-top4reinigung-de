import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CleaningParameters } from "./CleaningParameters";
import { GlassCalculationPanel } from "./GlassCalculationPanel";
import { StaircaseCalculationPanel } from "./StaircaseCalculationPanel";
import { CLEANING_TYPES } from "./shared";
import { findCleaningTypeRate, type PerformanceRate } from "@/lib/leistungswerte";
import { cleaningHoursPerVisit } from "@/lib/cleaning-hours";
import type { KalkulationStateContext } from "./useKalkulationState";
vi.mock("./FloorplanAttachments", () => ({ FloorplanAttachments: () => null }));
const rates: PerformanceRate[] = [
  { id: "u", label: "Unterhaltsreinigung", usage_type: "", floor_covering: "", sqm_per_hour: 170, active: true },
  { id: "g", label: "Grundreinigung", usage_type: "", floor_covering: "", sqm_per_hour: 50, active: true },
  { id: "w", label: "Glasreinigung", usage_type: "", floor_covering: "", sqm_per_hour: 80, active: true },
  { id: "s", label: "Treppenhaus", usage_type: "", floor_covering: "", sqm_per_hour: 120, minutes_per_floor: 12, active: true },
];
function state(type = "unterhalt", patch: Partial<KalkulationStateContext> = {}) {
  const selected = CLEANING_TYPES.find(t => t.value === type)!;
  return { type, selected, selectedPerformanceRate: findCleaningTypeRate(rates, type, selected.label), visiblePerformanceRates: rates,
    roomCalculation: { version: 1, enabled: false, rooms: [] }, roomSummary: { monthlyHours: 0 },
    lvPositions: [], area: "", glassArea: "", hours: "", hourlyRate: "", mode: "area",
    frequency: "1", frequencyUnit: "month", annualVisits: 12, visitsPerMonth: 1,
    extras: [], search: {}, stairs: false, targetSellingRate: 40, selfCostPerHour: 25,
    glassGrossWage: "18", laborBurdenPerHour: 6, ...patch,
  } as unknown as KalkulationStateContext;
}
describe("visible working time across all cleaning options", () => {
  it.each(CLEANING_TYPES.map(t => [t.value]))("%s starts without a fabricated area or hour", type => {
    const html = renderToStaticMarkup(createElement(CleaningParameters, { state: state(type), attachments: false }));
    expect(html).toContain('aria-label="Stundensatz (netto)"');
    expect(html).toContain('aria-label="Arbeitszeit je Einsatz (Std.)"');
    expect(html).toContain("Kalkulierten Stundensatz übernehmen");
    expect(html).toContain("Zeit aus Leistungswert neu berechnen");
    expect(html).not.toContain('value="150"');
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Arbeitszeit/);
  });
  it("glass starts with saved productivity and the shared area, without example windows", () => {
    const html = renderToStaticMarkup(createElement(GlassCalculationPanel, { state: state("glas", { glassArea: "160" }) }));
    expect(html).toContain("80");
    expect(html).toContain("2 Std. je Einsatz");
    expect(html).toContain('value="160"');
    expect(html).not.toContain('id="glass-count"');
    expect(html).not.toContain("Beispielminuten");
  });
  it("stairs uses the same area and saved rate as central costing", () => {
    const html = renderToStaticMarkup(createElement(StaircaseCalculationPanel, { state: state("treppenhaus", { area: "240" }) }));
    expect(html).toContain('value="240"');
    expect(html).toContain("2 Std. je Einsatz");
    expect(html).not.toContain('id="stair-floors"');
    expect(html).not.toContain("Beispiele");
  });
  it.each(CLEANING_TYPES.filter(t => t.value !== "bau").map(t => [t.value]))("%s uses its mapped persisted productivity", typeValue => {
    const s = state(typeValue);
    const h = cleaningHoursPerVisit({ mode: "area", typeValue, area: 340, glassArea: 160, hours: 1, sqmPerHour: s.selectedPerformanceRate!.sqm_per_hour });
    const html = renderToStaticMarkup(createElement(CleaningParameters, { state: state(typeValue, { area: "340", glassArea: "160" }), attachments: false }));
    expect(h).toBeGreaterThan(0);
    expect(html).toContain("Zeitbedarf je Einsatz");
    expect(html).not.toContain("Nicht hinterlegt");
  });
  it("a missing construction-cleaning rate stays visible instead of inventing one", () => {
    const html = renderToStaticMarkup(createElement(CleaningParameters, { state: state("bau"), attachments: false }));
    expect(html).toContain("Gespeicherter Leistungswert:");
  });
});
