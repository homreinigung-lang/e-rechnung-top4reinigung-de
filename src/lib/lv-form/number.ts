/**
 * Deutsche Zahleneingabe/-ausgabe für den LV-Formular-Ausfüller.
 *
 * Die Parser-Logik liegt zentral in `src/lib/format.ts` – hier gibt es nur noch
 * dünne Anpassungen (leere Eingabe ergibt `null` statt 0).
 */
import { parseGermanNumber as parseGermanNumberCore } from "@/lib/format";

/** "1.234,50" -> 1234.5 ; "220,5" -> 220.5 ; leer -> null */
export function parseGermanNumber(input: string): number | null {
  const raw = (input ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!raw) return null;
  return parseGermanNumberCore(raw);
}

/** Betrag in Cent aus deutscher Eingabe. */
export function parseGermanCents(input: string): number | null {
  const value = parseGermanNumber(input);
  return value === null ? null : Math.round(value * 100);
}

/** Zahl mit fester Nachkommastellenzahl in deutscher Schreibweise. */
export function formatGermanNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("de-DE-u-ca-gregory-nu-latn", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Cent-Betrag als deutscher Dezimalwert ohne Währungszeichen. */
export function formatCents(cents: number): string {
  return formatGermanNumber(cents / 100, 2);
}
