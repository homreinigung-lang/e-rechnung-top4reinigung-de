/**
 * Zeitkonto: Soll-/Ist-Vergleich je Mitarbeiter und Monat inkl. manueller
 * Korrekturen der Verwaltung. Mitarbeitende sehen das Zeitkonto nur lesend.
 */
import { isAbsence, isEffective } from "@/lib/absence";

/** Durchschnittliche Wochen je Monat (branchenüblich). */
export const WEEKS_PER_MONTH = 4.33;

export type TimeEntryLike = {
  employee_id?: string | null;
  work_date?: string | null;
  hours?: number | string | null;
  entry_type?: string | null;
  absence_reason?: string | null;
  approval_status?: string | null;
};

export type Adjustment = {
  id: string;
  employee_id: string;
  entry_date: string;
  hours: number;
  reason: string;
};

export function monthOf(date: string | null | undefined) {
  return String(date ?? "").slice(0, 7);
}

/** Soll-Stunden eines Monats aus den vertraglichen Wochenstunden. */
export function sollHours(weeklyHours: number | null | undefined) {
  const w = Number(weeklyHours ?? 0);
  return w > 0 ? Math.round(w * WEEKS_PER_MONTH * 100) / 100 : 0;
}

export type Zeitkonto = {
  ist: number;
  soll: number;
  korrektur: number;
  saldo: number;
};

/**
 * Zeitkonto für einen Mitarbeiter. Ohne `month` wird über alle Zeiträume
 * gerechnet (laufendes Guthaben / Minusstunden).
 */
export function zeitkontoFor(
  employeeId: string,
  weeklyHours: number | null | undefined,
  entries: TimeEntryLike[],
  adjustments: Adjustment[],
  month?: string,
): Zeitkonto {
  const rows = entries.filter(
    (e) =>
      e.employee_id === employeeId && isEffective(e) && (!month || monthOf(e.work_date) === month),
  );
  const ist = rows.filter((e) => !isAbsence(e)).reduce((s, e) => s + Number(e.hours || 0), 0);

  const korrektur = adjustments
    .filter((a) => a.employee_id === employeeId && (!month || monthOf(a.entry_date) === month))
    .reduce((s, a) => s + Number(a.hours || 0), 0);

  const months = month
    ? 1
    : new Set(rows.map((e) => monthOf(e.work_date)).filter(Boolean)).size || 1;
  const soll = Math.round(sollHours(weeklyHours) * months * 100) / 100;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ist: round(ist),
    soll,
    korrektur: round(korrektur),
    saldo: round(ist + korrektur - soll),
  };
}

export function formatStunden(n: number) {
  const v = Math.round(n * 100) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} Std.`;
}
