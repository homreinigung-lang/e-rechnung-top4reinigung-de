/**
 * Zentrale Rechenkonstanten – eine einzige Quelle für alle Module.
 *
 * Bewusst ungerundet: 52 Wochen pro Jahr sind die verbindliche Basis.
 * Der früher verwendete gerundete Monatsfaktor 4,33 ergibt über ein Jahr nur
 * 51,96 Wochen und führte zu abweichenden Ergebnissen zwischen Kalkulation
 * und LV-Analyse. In der Oberfläche darf weiterhin „≈ 4,33" angezeigt werden.
 */

export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_YEAR = 52;
export const WEEKS_PER_MONTH = WEEKS_PER_YEAR / MONTHS_PER_YEAR; // 4,3333…
/** Übliche Arbeitstage pro Jahr für „arbeitstäglich"/„werktäglich". */
export const WORKDAYS_PER_YEAR = 250;

/** Anzeigewert des Monatsfaktors (gerundet, nur für Texte). */
export const WEEKS_PER_MONTH_LABEL = "4,33";

/** Leistungszeiträume: einmaliger Auftrag oder wiederkehrender Turnus. */
export type RecurrenceUnit = "week" | "fortnight" | "month" | "quarter" | "year" | "once";

/** Restore only supported saved periods; retain the historic fallback for unknown values. */
export function readRecurrenceUnit(value: unknown): RecurrenceUnit {
  return value === "week" ||
    value === "fortnight" ||
    value === "quarter" ||
    value === "year" ||
    value === "once"
    ? value
    : "month";
}

/**
 * Verbindliche Jahresbasis für Einsatzmengen.
 * Wochenbasierte Turnusse werden immer aus 52 Wochen/Jahr abgeleitet.
 */
export function visitsPerYear(frequency: number, unit: RecurrenceUnit): number {
  const times = Math.max(0, Number(frequency) || 0);
  switch (unit) {
    case "once":
      return 1;
    case "week":
      return times * WEEKS_PER_YEAR;
    case "fortnight":
      return times * (WEEKS_PER_YEAR / 2);
    case "month":
      return times * MONTHS_PER_YEAR;
    case "quarter":
      return times * 4;
    case "year":
      return times;
  }
}

/** Monatsdurchschnitt; bei einmaliger Reinigung stattdessen genau ein Auftragseinsatz. */
export function visitsPerMonth(frequency: number, unit: RecurrenceUnit): number {
  // Einmalige Aufträge werden vollständig je Auftrag statt monatlich verteilt.
  return unit === "once" ? 1 : visitsPerYear(frequency, unit) / MONTHS_PER_YEAR;
}

export function recurrenceUnitLabel(unit: RecurrenceUnit): string {
  switch (unit) {
    case "once":
      return "einmalig";
    case "week":
      return "pro Woche";
    case "fortnight":
      return "alle 2 Wochen (14-tägig)";
    case "month":
      return "pro Monat";
    case "quarter":
      return "pro Quartal";
    case "year":
      return "pro Jahr";
  }
}

/** Mindest-/Standardpreis je Etage Treppenhausreinigung (netto). */
export const STAIR_RATE_PER_FLOOR = 12.5;
