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

/** Mindest-/Standardpreis je Etage Treppenhausreinigung (netto). */
export const STAIR_RATE_PER_FLOOR = 12.5;
