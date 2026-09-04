/**
 * Zeitkonto: Soll-/Ist-Vergleich je Mitarbeiter und Monat inkl. manueller
 * Korrekturen der Verwaltung. Mitarbeitende sehen das Zeitkonto nur lesend.
 */
import { isAbsence, isEffective } from "@/lib/absence";
import { WEEKS_PER_MONTH } from "@/lib/constants";

export { WEEKS_PER_MONTH } from "@/lib/constants";

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

/**
 * Tages-Sollzeit (5-Tage-Woche). Wird für genehmigte Abwesenheiten
 * gutgeschrieben: Urlaub und Krankheit dürfen kein Minus erzeugen.
 */
export function dailyHours(weeklyHours: number | null | undefined) {
  const w = Number(weeklyHours ?? 0);
  return w > 0 ? Math.round((w / 5) * 100) / 100 : 0;
}

/** Anzahl Tage eines Monats („2026-03" → 31). */
function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * Soll-Stunden eines einzelnen Monats unter Berücksichtigung des
 * Eintrittsdatums: vor dem Eintritt entsteht kein Soll, im Eintrittsmonat wird
 * anteilig gerechnet.
 */
export function sollHoursForMonth(
  weeklyHours: number | null | undefined,
  month: string,
  contractStart?: string | null,
) {
  const full = sollHours(weeklyHours);
  if (full <= 0 || !month) return 0;
  const start = String(contractStart ?? "").slice(0, 10);
  if (!start) return full;
  const startMonth = start.slice(0, 7);
  if (startMonth > month) return 0;
  if (startMonth < month) return full;
  const total = daysInMonth(month);
  const startDay = Number(start.slice(8, 10)) || 1;
  const share = (total - startDay + 1) / total;
  return Math.round(full * share * 100) / 100;
}

export type Zeitkonto = {
  ist: number;
  /** Tatsächlich geleistete Arbeitsstunden (ohne Abwesenheiten). */
  gearbeitet: number;
  /** Gutschrift für genehmigte Abwesenheiten (Urlaub, Krankheit, Sonstiges). */
  abwesenheit: number;
  soll: number;
  korrektur: number;
  saldo: number;
};

/**
 * Zeitkonto für einen Mitarbeiter. Ohne `month` wird über alle Zeiträume
 * gerechnet (laufendes Guthaben / Minusstunden). `contractStart` verhindert
 * Sollstunden vor dem Eintrittsdatum.
 */
export function zeitkontoFor(
  employeeId: string,
  weeklyHours: number | null | undefined,
  entries: TimeEntryLike[],
  adjustments: Adjustment[],
  month?: string,
  contractStart?: string | null,
): Zeitkonto {
  const rows = entries.filter(
    (e) =>
      e.employee_id === employeeId && isEffective(e) && (!month || monthOf(e.work_date) === month),
  );
  const gearbeitet = rows.filter((e) => !isAbsence(e)).reduce((s, e) => s + Number(e.hours || 0), 0);

  // Genehmigte Abwesenheiten werden mit der Tages-Sollzeit gutgeschrieben,
  // damit Urlaub und Krankheit keine Minusstunden erzeugen.
  const tagessoll = dailyHours(weeklyHours);
  const abwesenheitstage = new Set(
    rows.filter((e) => isAbsence(e)).map((e) => String(e.work_date ?? "")),
  );
  abwesenheitstage.delete("");
  const abwesenheit = abwesenheitstage.size * tagessoll;
  const ist = gearbeitet + abwesenheit;

  const korrektur = adjustments
    .filter((a) => a.employee_id === employeeId && (!month || monthOf(a.entry_date) === month))
    .reduce((s, a) => s + Number(a.hours || 0), 0);

  const months = month
    ? [month]
    : Array.from(new Set(rows.map((e) => monthOf(e.work_date)).filter(Boolean)));
  const soll =
    Math.round(
      months.reduce((s, m) => s + sollHoursForMonth(weeklyHours, m, contractStart), 0) * 100,
    ) / 100;


  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ist: round(ist),
    gearbeitet: round(gearbeitet),
    abwesenheit: round(abwesenheit),
    soll,
    korrektur: round(korrektur),
    saldo: round(ist + korrektur - soll),
  };
}

/* ---------------------------------------------------------------------------
 * Urlaubskonto: Anspruch, genommene Tage und Resturlaub
 * ------------------------------------------------------------------------- */

export type Urlaubskonto = {
  anspruch: number;
  uebertrag: number;
  genommen: number;
  beantragt: number;
  rest: number;
};

/**
 * Urlaubskonto eines Mitarbeiters für ein Kalenderjahr.
 * `genommen` zählt genehmigte Urlaubstage, `beantragt` offene Anträge.
 */
export function urlaubskontoFor(
  employeeId: string,
  entitlement: { vacation_days_per_year?: number | string | null; vacation_carryover_days?: number | string | null },
  entries: (TimeEntryLike & { approval_status?: string | null })[],
  year: string,
): Urlaubskonto {
  const anspruch = Number(entitlement.vacation_days_per_year ?? 0) || 0;
  const uebertrag = Number(entitlement.vacation_carryover_days ?? 0) || 0;

  const rows = entries.filter(
    (e) =>
      e.employee_id === employeeId &&
      isAbsence(e) &&
      (e.absence_reason ?? "") === "vacation" &&
      String(e.work_date ?? "").slice(0, 4) === year,
  );
  const daysFor = (status: string) => {
    const set = new Set(
      rows
        .filter((e) => (e.approval_status ?? "approved") === status)
        .map((e) => String(e.work_date ?? "")),
    );
    set.delete("");
    return set.size;
  };

  const genommen = daysFor("approved");
  const beantragt = daysFor("pending");
  return {
    anspruch,
    uebertrag,
    genommen,
    beantragt,
    rest: Math.round((anspruch + uebertrag - genommen - beantragt) * 100) / 100,
  };
}

export function formatStunden(n: number) {
  const v = Math.round(n * 100) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} Std.`;
}
