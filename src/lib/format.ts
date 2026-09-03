// Deutsches Zahlen-/Datumsformat, ausschließlich gregorianisch und
// mit lateinischen Ziffern (nu-latn, ca-gregory) – keine Hidschri-Daten,
// keine östlich-arabischen Ziffern, unabhängig von den Systemeinstellungen.
const DE_LOCALE = "de-DE-u-ca-gregory-nu-latn";

export const EUR = new Intl.NumberFormat(DE_LOCALE, {
  style: "currency",
  currency: "EUR",
  numberingSystem: "latn",
});

const DE_NUMBER = new Intl.NumberFormat(DE_LOCALE, {
  numberingSystem: "latn",
  maximumFractionDigits: 2,
});

/**
 * Kaufmännisch auf volle Cent runden. Einzige Implementierung im Projekt
 * (src/lib/money.ts) – hier nur für bestehende Importe weitergereicht.
 */
export { roundCents, toCents, fromCents } from "@/lib/money";


export function formatMoney(value: number): string {
  return EUR.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return DE_NUMBER.format(Number.isFinite(value) ? value : 0);
}

/**
 * Liest eine deutsche Zahleneingabe robust ein: „1.234,56" (Tausenderpunkt),
 * „1234,56", „1234.56" und „1 234,56" ergeben alle 1234,56.
 */
export function parseGermanNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? "")
    .replace(/[\s\u00a0€]/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Das zuletzt stehende Zeichen ist das Dezimaltrennzeichen.
    if (lastComma > lastDot) raw = raw.replace(/\./g, "").replace(",", ".");
    else raw = raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    // Reiner Tausenderpunkt ohne Dezimalstellen: 1.234 → 1234
    raw = raw.replace(/\./g, "");
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Wie parseGermanNumber, aber niemals negativ (für Mengen, Flächen, Preise). */
export function parsePositiveNumber(value: string | number | null | undefined): number {
  return Math.max(0, parseGermanNumber(value));
}

const DE_DATE = new Intl.DateTimeFormat(DE_LOCALE, {
  calendar: "gregory",
  numberingSystem: "latn",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DE_DATE.format(date);
}

/** Lokales Datum als ISO-Tag (JJJJ-MM-TT) – ohne UTC-Verschiebung. */
function isoLocalDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return isoLocalDay(date);
}

export function today(): string {
  return isoLocalDay(new Date());
}

/** Wandelt eine deutsche Datumseingabe (TT.MM.JJJJ) in ISO (JJJJ-MM-TT) um. */
export function parseGermanDate(value: string): string | null {
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "Rechnung",
  quote: "Angebot",
  order: "Auftragsbestätigung",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  paid: "Bezahlt",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  cancelled: "Storniert",
};

export type DocKind = "invoice" | "quote" | "order";

export function nextNumber(type: DocKind, existing: string[]): string {
  const year = new Date().getFullYear();
  const code = type === "invoice" ? "RE" : type === "order" ? "AB" : "AN";
  const prefix = `${code}-${year}-`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export const REVERSE_CHARGE_NOTE =
  "Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge-Verfahren gemäß § 13b UStG / Art. 196 MwStSystRL). Die Steuerschuld geht auf den Leistungsempfänger über.";

export const NO_VAT_NOTE =
  "Es wird keine Umsatzsteuer ausgewiesen (innergemeinschaftliche Leistung, Reverse-Charge-Verfahren).";

export const KLEINUNTERNEHMER_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Umsatzsteuersatz je Steuerart. */
export function vatRateForTaxMode(taxMode: string): number {
  return taxMode === "domestic" ? 19 : 0;
}

/** Pflichthinweis auf dem Beleg je Steuerart (leer bei Inlandsumsatz). */
export function taxNoteForTaxMode(taxMode: string): string {
  if (taxMode === "kleinunternehmer") return KLEINUNTERNEHMER_NOTE;
  if (taxMode === "domestic") return "";
  return REVERSE_CHARGE_NOTE;
}
