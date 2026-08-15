/** Hilfsfunktionen für die Wochenplanung (Stunden je Wochentag, Mo–So). */

export const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const DAY_NAMES = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

/** Sichert immer ein Array mit 7 Tageswerten (Mo–So). */
export function normalizeDayHours(value: unknown): number[] {
  const arr = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, i) => Number(arr[i] ?? 0) || 0);
}

export function sumDayHours(value: unknown): number {
  return normalizeDayHours(value).reduce((s, n) => s + n, 0);
}

/** Wochenstunden ohne Tageswerte gleichmäßig auf Mo–Fr verteilen (Altbestand). */
export function effectiveDayHours(dayHours: unknown, weeklyHours: number | null | undefined): number[] {
  const days = normalizeDayHours(dayHours);
  const sum = days.reduce((s, n) => s + n, 0);
  const week = Number(weeklyHours ?? 0);
  if (sum === 0 && week > 0) {
    const per = week / 5;
    return [per, per, per, per, per, 0, 0];
  }
  return days;
}
