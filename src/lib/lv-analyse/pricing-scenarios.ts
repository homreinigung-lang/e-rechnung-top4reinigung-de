/** Internal indicative scenarios; never writes offer prices. */
export function pricingScenarios(annualHours: number, costPerHour: number) {
  if (!Number.isFinite(annualHours) || annualHours <= 0 || !Number.isFinite(costPerHour) || costPerHour <= 0) return null;
  const scenarios = [
    { label: "Wettbewerbsorientiert", markup: 0.08 },
    { label: "Ausgewogen", markup: 0.18 },
    { label: "Mit Reserve", markup: 0.3 },
  ];
  return scenarios.map(({ label, markup }) => {
    const hourlyRate = Math.ceil(costPerHour * (1 + markup) * 100) / 100;
    const annualNet = Math.round(hourlyRate * annualHours * 100) / 100;
    const annualCost = Math.round(costPerHour * annualHours * 100) / 100;
    return { label, hourlyRate, annualNet, annualCost, annualResult: Math.round((annualNet - annualCost) * 100) / 100 };
  });
}
