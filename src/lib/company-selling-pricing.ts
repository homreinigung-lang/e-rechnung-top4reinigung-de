import { findCleaningTypeRate, type PerformanceRate } from "./leistungswerte";

export type CompanySellingPricing = {
  hourlyRate: number | null;
  rates: PerformanceRate[];
  source?: "job" | "company";
  costBasis?: { selfCostPerHour: number; profitMarkupPercent: number };
};

export function savedSellingBasis(pricing: CompanySellingPricing, type: string, label: string) {
  const hourlyRate = Number(pricing.hourlyRate);
  const valid = hourlyRate > 0 && Number.isFinite(hourlyRate);
  const rate = findCleaningTypeRate(pricing.rates, type, label);
  return {
    hourlyRate: valid ? hourlyRate : 0,
    sqmPerHour: Number(rate?.sqm_per_hour ?? 0),
    minutesPerFloor: Number(rate?.minutes_per_floor ?? 0),
    label: rate?.label ?? "",
  };
}

/** Same cost-plus calculation used by Kosten & Wirtschaftlichkeit, without invented defaults. */
export function companyCostSellingBasis(settings: {
  calc_worker_hourly_wage: number | null;
  calc_labor_burden_percent: number | null;
  calc_material_cost_hour: number | null;
  calc_overhead_cost_hour: number | null;
  calc_profit_markup_percent: number | null;
} | null) {
  if (!settings || Object.values(settings).some(value => value === null || !Number.isFinite(value) || value < 0)
      || settings.calc_worker_hourly_wage! <= 0) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  const wage = settings.calc_worker_hourly_wage!;
  const selfCostPerHour = round(wage + round(wage * Math.min(200, settings.calc_labor_burden_percent!) / 100)
    + settings.calc_material_cost_hour! + settings.calc_overhead_cost_hour!);
  const profitMarkupPercent = Math.min(100, settings.calc_profit_markup_percent!);
  return { hourlyRate: round(selfCostPerHour * (1 + profitMarkupPercent / 100)), selfCostPerHour, profitMarkupPercent };
}
