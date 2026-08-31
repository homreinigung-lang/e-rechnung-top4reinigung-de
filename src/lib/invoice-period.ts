import { formatDate } from "@/lib/format";

/** Ein Leistungszeitraum als ISO-Tage (JJJJ-MM-TT). */
export type Period = { start: string; end: string };

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDay(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/**
 * Liest einen Leistungszeitraum robust aus dem Freitextfeld:
 * „01.08.2026 – 31.08.2026“, „01.08.2026“, „August 2026“, „2026-08-01“.
 * Gibt null zurück, wenn nichts Verwertbares enthalten ist.
 */
export function parseServicePeriod(text: string | null | undefined): Period | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const dates: string[] = [];
  const de = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
  for (const m of raw.matchAll(de)) dates.push(iso(Number(m[3]), Number(m[2]), Number(m[1])));
  const isoRe = /(\d{4})-(\d{2})-(\d{2})/g;
  for (const m of raw.matchAll(isoRe)) dates.push(iso(Number(m[1]), Number(m[2]), Number(m[3])));

  if (dates.length > 0) {
    const sorted = [...dates].sort();
    return { start: sorted[0]!, end: sorted[sorted.length - 1]! };
  }

  const monthMatch = new RegExp(`(${MONTHS.join("|")})\\s+(\\d{4})`, "i").exec(raw);
  if (monthMatch) {
    const monthIndex = MONTHS.findIndex(
      (m) => m.toLowerCase() === monthMatch[1]!.toLowerCase(),
    );
    const year = Number(monthMatch[2]);
    return monthPeriod(year, monthIndex + 1);
  }
  return null;
}

/** Vollständiger Monatszeitraum als Period. */
export function monthPeriod(year: number, month: number): Period {
  return { start: iso(year, month, 1), end: iso(year, month, lastDay(year, month)) };
}

/** Formatiert einen Zeitraum im deutschen Anzeigeformat des Belegfelds. */
export function formatPeriod(p: Period): string {
  const from = formatDate(p.start);
  const to = formatDate(p.end);
  return to && to !== from ? `${from} – ${to}` : from;
}

/** Monatszeitraum, der zu einem Rechnungsdatum gehört (JJJJ-MM-TT). */
export function periodForIssueDate(issueDate: string): Period | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(issueDate ?? "").slice(0, 10));
  if (!m) return null;
  return monthPeriod(Number(m[1]), Number(m[2]));
}

/** Monatsschlüssel „JJJJ-MM“ eines ISO-Datums. */
export function monthKey(isoDate: string): string {
  return String(isoDate ?? "").slice(0, 7);
}

/** Lesbarer Monatsname, z. B. „August 2026“. */
export function monthLabel(isoDate: string): string {
  const key = monthKey(isoDate);
  const [y, m] = key.split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : key;
}

export type PeriodCheck = { level: "ok" | "warn" | "error"; message: string };

/**
 * Prüft Rechnungsdatum gegen Leistungszeitraum:
 * – Fehler, wenn das Rechnungsdatum vor dem Beginn der Leistung liegt (§ 14 UStG).
 * – Warnung, wenn Rechnungsmonat und Leistungsmonat auseinanderfallen.
 */
export function checkInvoiceDates(
  issueDate: string,
  servicePeriod: string | null | undefined,
): PeriodCheck {
  const issue = String(issueDate ?? "").slice(0, 10);
  const period = parseServicePeriod(servicePeriod);
  if (!issue || !period) return { level: "ok", message: "" };

  if (issue < period.start) {
    return {
      level: "error",
      message: `Das Rechnungsdatum (${formatDate(issue)}) liegt vor dem Beginn des Leistungszeitraums (${formatDate(period.start)}). Eine Rechnung darf nicht vor der Leistung datiert sein.`,
    };
  }
  if (monthKey(issue) !== monthKey(period.end)) {
    return {
      level: "warn",
      message: `Rechnungsmonat (${monthLabel(issue)}) und Leistungsmonat (${monthLabel(period.end)}) weichen voneinander ab. Bitte prüfen Sie Leistungszeitraum und Leistungsbeschreibung.`,
    };
  }
  return { level: "ok", message: "" };
}

/**
 * Ersetzt einen Monatsnamen in der Leistungsbeschreibung durch den Monat
 * des Leistungszeitraums – hält Beschreibung und Zeitraum synchron.
 */
export function syncMonthInText(text: string, targetIsoDate: string): string {
  const label = monthLabel(targetIsoDate);
  const [name, year] = label.split(" ");
  if (!name || !year) return text;
  const re = new RegExp(`(${MONTHS.join("|")})(\\s+\\d{4})?`, "gi");
  if (!re.test(text)) return text;
  return text.replace(re, (_m, _n, y) => (y ? `${name} ${year}` : name));
}
