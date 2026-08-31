/** Deutsche Zahleneingabe/-ausgabe für den LV-Formular-Ausfüller (eigenständig). */

/** "1.234,50" -> 1234.5 ; "220,5" -> 220.5 ; leer -> null */
export function parseGermanNumber(input: string): number | null {
  const raw = (input ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
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
