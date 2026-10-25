/** Workload is independent of selling prices. Manual hours stay authoritative in hours mode. */
export function cleaningHoursPerVisit(input: {
  mode: "area" | "hours";
  typeValue: string;
  area: number;
  glassArea: number;
  hours: number;
  sqmPerHour: number;
}): number {
  if (input.mode === "hours") return Number.isFinite(input.hours) ? Math.max(0, input.hours) : 0;
  const area = input.typeValue === "glas" ? input.glassArea : input.area;
  return Number.isFinite(area) && area > 0 && Number.isFinite(input.sqmPerHour) && input.sqmPerHour > 0
    ? area / input.sqmPerHour
    : 0;
}

/** Keep the derived square-metre price unrounded until the position total is rounded. */
export function pricePerSqmFromHourly(hourlyRate: number, sqmPerHour: number): number {
  return Number.isFinite(hourlyRate) && hourlyRate > 0 && Number.isFinite(sqmPerHour) && sqmPerHour > 0
    ? hourlyRate / sqmPerHour
    : 0;
}
