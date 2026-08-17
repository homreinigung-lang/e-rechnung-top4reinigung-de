/** Hilfsfunktionen für die Wochenplanung (Arbeitszeiten je Wochentag, Mo–So). */

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

/** Arbeitszeit eines Tages: Von–Bis mit optionaler Pause (in Minuten). */
export type DayTime = { start: string; end: string; breakMin: number };

export const EMPTY_DAY_TIME: DayTime = { start: "", end: "", breakMin: 0 };

/** Sichert immer ein Array mit 7 Tageswerten (Mo–So). */
export function normalizeDayHours(value: unknown): number[] {
  const arr = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, i) => Number(arr[i] ?? 0) || 0);
}

function normalizeTime(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Sichert immer 7 Zeitfenster (Mo–So). */
export function normalizeDayTimes(value: unknown): DayTime[] {
  const arr = Array.isArray(value) ? value : [];
  return Array.from({ length: 7 }, (_, i) => {
    const raw = (arr[i] ?? {}) as Partial<DayTime>;
    return {
      start: normalizeTime(raw?.start),
      end: normalizeTime(raw?.end),
      breakMin: Math.max(0, Number(raw?.breakMin ?? 0) || 0),
    };
  });
}

/** Stunden aus Von–Bis abzüglich Pause; über Mitternacht wird mitgerechnet. */
export function timeToHours(time: DayTime | undefined | null): number {
  if (!time?.start || !time?.end) return 0;
  const [sh, sm] = time.start.split(":").map(Number);
  const [eh, em] = time.end.split(":").map(Number);
  let minutes = eh! * 60 + em! - (sh! * 60 + sm!);
  if (minutes < 0) minutes += 24 * 60;
  minutes -= Math.max(0, Number(time.breakMin) || 0);
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function dayTimesToHours(value: unknown): number[] {
  return normalizeDayTimes(value).map((t) => timeToHours(t));
}

/** Lesbares Label „08:00–16:00“ (leer, wenn keine Zeiten gepflegt sind). */
export function formatDayTime(time: DayTime | undefined | null): string {
  if (!time?.start || !time?.end) return "";
  return `${time.start}–${time.end}`;
}

export function sumDayHours(value: unknown): number {
  return normalizeDayHours(value).reduce((s, n) => s + n, 0);
}

/**
 * Tagesstunden: bevorzugt aus den Zeitfenstern berechnet, sonst aus den
 * gespeicherten Stunden bzw. (Altbestand) gleichmäßig auf Mo–Fr verteilt.
 */
export function effectiveDayHours(
  dayHours: unknown,
  weeklyHours: number | null | undefined,
  dayTimes?: unknown,
): number[] {
  const fromTimes = dayTimesToHours(dayTimes);
  if (fromTimes.some((h) => h > 0)) return fromTimes;

  const days = normalizeDayHours(dayHours);
  const sum = days.reduce((s, n) => s + n, 0);
  const week = Number(weeklyHours ?? 0);
  if (sum === 0 && week > 0) {
    const per = week / 5;
    return [per, per, per, per, per, 0, 0];
  }
  return days;
}
