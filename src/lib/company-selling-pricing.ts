import { findCleaningTypeRate, type PerformanceRate } from "./leistungswerte";

export type CompanySellingPricing = {
  minimum: number | null;
  maximum: number | null;
  rates: PerformanceRate[];
};

export function savedSellingBasis(pricing: CompanySellingPricing, type: string, label: string) {
  const minimum = Number(pricing.minimum);
  const maximum = Number(pricing.maximum);
  const valid = minimum > 0 && Number.isFinite(minimum) && maximum >= minimum && Number.isFinite(maximum);
  const rate = findCleaningTypeRate(pricing.rates, type, label);
  return {
    minimum: valid ? minimum : 0,
    maximum: valid ? maximum : 0,
    sqmPerHour: Number(rate?.sqm_per_hour ?? 0),
    minutesPerFloor: Number(rate?.minutes_per_floor ?? 0),
    label: rate?.label ?? "",
  };
}
