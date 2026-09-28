function parseIsoDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error("Ungültiges Datum.");
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Advances a recurring monthly date while preserving its original anchor day.
 * Example: 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar.
 */
export function nextRecurringDate(
  scheduledDate: string,
  intervalMonths: number,
  anchorDay: number,
): string {
  const { year, month, day } = parseIsoDate(scheduledDate);
  const interval = Math.max(1, Math.trunc(Number(intervalMonths) || 1));
  const anchor = Math.min(31, Math.max(1, Math.trunc(Number(anchorDay) || day)));

  const target = new Date(Date.UTC(year, month - 1 + interval, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(anchor, lastDay);

  return [
    target.getUTCFullYear(),
    String(target.getUTCMonth() + 1).padStart(2, "0"),
    String(targetDay).padStart(2, "0"),
  ].join("-");
}

export function recurringAnchorDay(dateStr: string): number {
  return parseIsoDate(dateStr).day;
}
