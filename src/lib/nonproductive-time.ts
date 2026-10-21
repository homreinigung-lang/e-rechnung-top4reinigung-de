/**
 * Optional internal costing for paid time that is not spent cleaning.
 * This module does not change customer offers or saved calculations.
 */
export type NonproductiveTimeInput = {
  cleaningHoursPerMonth: number;
  paidTravelHoursPerMonth?: number;
  paidPreparationHoursPerMonth?: number;
  otherPaidHoursPerMonth?: number;
  laborCostPerHour: number;
  materialCostPerCleaningHour?: number;
  overheadCostPerPaidHour?: number;
  profitMarkupPercent?: number;
  sellingRatePerPaidHour?: number;
};

export type NonproductiveTimeResult = {
  paidHoursPerMonth: number;
  nonproductiveHoursPerMonth: number;
  totalMonthlyCost: number;
  suggestedMonthlyRevenue: number;
  estimatedMonthlyResult: number;
  breakEvenPerCleaningHour: number | null;
  targetPerCleaningHour: number | null;
};

const valid = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
const cents = (value: number): number => Math.round(value * 100) / 100;

export function calculateNonproductiveTime(input: NonproductiveTimeInput): NonproductiveTimeResult {
  const cleaning = valid(input.cleaningHoursPerMonth);
  const nonproductive =
    valid(input.paidTravelHoursPerMonth) +
    valid(input.paidPreparationHoursPerMonth) +
    valid(input.otherPaidHoursPerMonth);
  const paid = cleaning + nonproductive;
  const labor = valid(input.laborCostPerHour);
  const materials = valid(input.materialCostPerCleaningHour);
  const overhead = valid(input.overheadCostPerPaidHour);
  const markup = valid(input.profitMarkupPercent);
  const total = cents(paid * (labor + overhead) + cleaning * materials);
  const revenue = cents(paid * valid(input.sellingRatePerPaidHour));
  return {
    paidHoursPerMonth: cents(paid),
    nonproductiveHoursPerMonth: cents(nonproductive),
    totalMonthlyCost: total,
    suggestedMonthlyRevenue: revenue,
    estimatedMonthlyResult: cents(revenue - total),
    breakEvenPerCleaningHour: cleaning > 0 ? cents(total / cleaning) : null,
    targetPerCleaningHour: cleaning > 0 ? cents((total / cleaning) * (1 + markup / 100)) : null,
  };
}
