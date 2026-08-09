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

export function formatMoney(value: number): string {
  return EUR.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number): string {
  return DE_NUMBER.format(Number.isFinite(value) ? value : 0);
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

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
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
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  paid: "Bezahlt",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  cancelled: "Storniert",
};

export function nextNumber(type: "invoice" | "quote", existing: string[]): string {
  const year = new Date().getFullYear();
  const prefix = type === "invoice" ? `RE-${year}-` : `AN-${year}-`;
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
