/** Internal indicative scenarios; never writes offer prices. */
export function pricingScenarios(annualHours: number, costPerHour: number, extraPaidHoursPerMonth = 0) {
  if (!Number.isFinite(annualHours) || annualHours <= 0 || !Number.isFinite(costPerHour) || costPerHour <= 0) return null;
  if (!Number.isFinite(extraPaidHoursPerMonth) || extraPaidHoursPerMonth < 0) return null;
  const annualPaidHours = annualHours + extraPaidHoursPerMonth * 12;
  const annualCostTotal = Math.round(costPerHour * annualPaidHours * 100) / 100;
  const effectiveCostPerCleaningHour = annualCostTotal / annualHours;
  const scenarios = [
    { label: "Wettbewerbsorientiert", markup: 0.08 },
    { label: "Ausgewogen", markup: 0.18 },
    { label: "Mit Reserve", markup: 0.3 },
  ];
  return scenarios.map(({ label, markup }) => {
    const hourlyRate = Math.ceil(effectiveCostPerCleaningHour * (1 + markup) * 100) / 100;
    const annualNet = Math.round(hourlyRate * annualHours * 100) / 100;
    const annualCost = annualCostTotal;
    return { label, hourlyRate, annualNet, annualCost, annualResult: Math.round((annualNet - annualCost) * 100) / 100 };
  });
}
