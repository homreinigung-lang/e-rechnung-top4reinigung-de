import { pricePerSqmFromHourly } from "./cleaning-hours";

/** null keeps an imported analysis price stable, including when rate data arrives later. */
export function automaticAreaPrice(input: {
  analysis: { type: string; hourlyRate: number } | null;
  cleaningType: string;
  hourlyRate: number;
  sqmPerHour: number;
}): number | null {
  if (input.analysis && input.analysis.type === input.cleaningType && input.analysis.hourlyRate === input.hourlyRate) return null;
  return input.sqmPerHour > 0 && input.hourlyRate > 0
    ? pricePerSqmFromHourly(input.hourlyRate, input.sqmPerHour)
    : 0;
}
