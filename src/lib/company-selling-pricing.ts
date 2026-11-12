import { findCleaningTypeRate, type PerformanceRate } from "./leistungswerte";

export type CompanySellingPricing = {
  hourlyRate: number | null;
  rates: PerformanceRate[];
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
