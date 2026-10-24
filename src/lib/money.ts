/**
 * Einziges Rundungsmodul des Projekts.
 *
 * Alle Geldbeträge (Kalkulation, LV-Analyse, LV-PDF, Belegeditor, Dokument-PDF)
 * werden ausschließlich über diese Funktionen gerundet. Damit sind Datenbank,
 * Oberfläche und PDF garantiert identisch (Netto + MwSt. = Brutto).
 */

/** Betrag als ganze Cent (kaufmännisch, symmetrisch für negative Werte). */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Dezimalstelle per Exponent verschieben: 162.015 * 100 liegt binär knapp
  // unter 16201.5. Ein fixes EPSILON kann das bei größeren Beträgen nicht
  // ausgleichen. Die dezimale Darstellung erhält den beabsichtigten Halbcent.
  const [mantissa, exponent = "0"] = Math.abs(value).toString().split("e");
  const shifted = Number(`${mantissa}e${Number(exponent) + 2}`);
  return Math.sign(value) * Math.round(shifted);
}

/** Ganze Cent zurück in Euro. */
export function fromCents(value: number): number {
  return Math.trunc(Number.isFinite(value) ? value : 0) / 100;
}

/** Kaufmännisch auf volle Cent runden. */
export function roundCents(value: number): number {
  return fromCents(toCents(value));
}

/** Alias für roundCents (historischer Name in der Kalkulation). */
export const round2 = roundCents;
