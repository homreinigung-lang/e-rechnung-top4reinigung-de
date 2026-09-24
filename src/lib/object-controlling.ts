import { parseServicePeriod } from "@/lib/invoice-period";
import { effectiveDayHours } from "@/lib/planung";

export type RevenueDocument = {
  issue_date: string;
  service_period?: string | null;
  net_total?: number | string | null;
  total?: number | string | null;
};

export type PlannedAssignment = {
  start_date?: string | null;
  end_date?: string | null;
  hours_per_week?: number | string | null;
  day_hours?: unknown;
  day_times?: unknown;
};

function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function isoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 12));
}

function addDays(value: string, days: number) {
  const date = isoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(start: string, end: string) {
  return Math.floor((isoDate(end).getTime() - isoDate(start).getTime()) / 86_400_000) + 1;
}

function mondayIndex(value: string) {
  const day = isoDate(value).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

/**
 * Netto-Umsatz eines Belegs für einen Controlling-Monat.
 *
 * Leistungszeitraum hat Vorrang vor Rechnungsdatum. Bei monatsübergreifenden
 * Leistungszeiträumen wird der Netto-Umsatz taggenau auf die Monate verteilt.
 * Nur wenn kein verwertbarer Leistungszeitraum vorhanden ist, gilt das Rechnungsdatum.
 */
export function revenueForMonth(document: RevenueDocument, month: string): number {
  const amount = Number(document.net_total ?? document.total ?? 0) || 0;
  if (!amount) return 0;

  const bounds = monthBounds(month);
  if (!bounds) return 0;

  const period = parseServicePeriod(document.service_period);
  if (!period) {
    return String(document.issue_date ?? "").slice(0, 7) === month ? amount : 0;
  }

  const overlapStart = period.start > bounds.start ? period.start : bounds.start;
  const overlapEnd = period.end < bounds.end ? period.end : bounds.end;
  if (overlapStart > overlapEnd) return 0;

  const totalDays = inclusiveDays(period.start, period.end);
  const overlapDays = inclusiveDays(overlapStart, overlapEnd);
  if (totalDays <= 0) return 0;
  return amount * (overlapDays / totalDays);
}

/**
 * Exakte Planstunden eines Monats aus den gespeicherten Tages-/Wochenplänen.
 *
 * Wochenpläne werden nur für die tatsächlich im Monat liegenden Kalendertage
 * gezählt. Altbestand ohne Startdatum wird als wiederkehrende Wochenplanung
 * über den gesamten Monat angewendet. Sobald datierte Wochenpläne existieren,
 * wird undatierter Altbestand nicht zusätzlich addiert (Schutz vor Doppelzählung).
 */
export function plannedHoursForMonth(
  assignments: PlannedAssignment[],
  month: string,
): number {
  const bounds = monthBounds(month);
  if (!bounds || assignments.length === 0) return 0;

  const dated = assignments.filter((assignment) => Boolean(assignment.start_date));
  const source = dated.length > 0 ? dated : assignments;

  return source.reduce((total, assignment) => {
    const dayHours = effectiveDayHours(
      assignment.day_hours,
      Number(assignment.hours_per_week ?? 0),
      assignment.day_times,
    );

    let rangeStart = bounds.start;
    let rangeEnd = bounds.end;

    if (assignment.start_date) {
      const assignmentStart = String(assignment.start_date).slice(0, 10);
      const assignmentEnd = assignment.end_date
        ? String(assignment.end_date).slice(0, 10)
        : addDays(assignmentStart, 6);
      rangeStart = assignmentStart > bounds.start ? assignmentStart : bounds.start;
      rangeEnd = assignmentEnd < bounds.end ? assignmentEnd : bounds.end;
    } else if (assignment.end_date) {
      const assignmentEnd = String(assignment.end_date).slice(0, 10);
      rangeEnd = assignmentEnd < bounds.end ? assignmentEnd : bounds.end;
    }

    if (rangeStart > rangeEnd) return total;

    let subtotal = 0;
    for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) {
      subtotal += Number(dayHours[mondayIndex(day)] ?? 0) || 0;
    }
    return total + subtotal;
  }, 0);
}
