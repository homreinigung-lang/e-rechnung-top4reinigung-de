/**
 * Generische Summen-Logik für ALLE Tabellen und Exporte im System.
 *
 * Jede Tabelle/jeder Export mit Zahlen (Stunden, Beträge, Mengen) erhält damit
 * automatisch einen Zusammenfassungsblock am Anfang des Dokuments bzw. der Ansicht.
 */

export type TableRow = Record<string, unknown>;

export type SummaryEntry = {
  /** Spaltenname aus der Tabelle */
  column: string;
  /** Beschriftung für die Zusammenfassung, z. B. „Gesamtstunden“ */
  label: string;
  /** Summe über alle Zeilen */
  total: number;
  /** Art der Kennzahl – steuert die Formatierung */
  kind: "hours" | "money" | "number";
};

const DE_NUM = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+([.,]\d+)?$/;

/** Liest deutsche Zahlenstrings („1.234,56“, „37,50“, „12“) robust ein. */
export function parseDeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .replace(/[\s\u00a0€]/g, "")
    .replace(/[^0-9,.\-]/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function isNumericValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const raw = String(value ?? "")
    .replace(/[\s\u00a0€]/g, "")
    .trim();
  if (!raw) return false;
  return DE_NUM.test(raw);
}

const MONEY_HINTS = [
  "betrag",
  "lohn",
  "preis",
  "netto",
  "brutto",
  "umsatz",
  "summe",
  "vorsteuer",
  "steuer",
  "kosten",
  "gehalt",
  "zahllast",
  "saldo",
  "eur",
  "€",
];
const HOURS_HINTS = ["stunde", "std", "arbeitszeit"];
/** Spalten, die niemals summiert werden (IDs, Nummern, Datumsangaben, Sätze). */
const EXCLUDE_HINTS = [
  "nummer",
  "nr.",
  "-nr",
  "konto",
  "datum",
  "jahr",
  "monat",
  "belegfeld",
  "id",
  "plz",
  "iban",
  "satz",
  "prozent",
  "%",
  "von",
  "bis",
  "schlüssel",
  "kennzeichen",
  "wkz",
];

function classify(column: string): "hours" | "money" | "number" {
  const c = column.toLowerCase();
  if (HOURS_HINTS.some((h) => c.includes(h))) return "hours";
  if (MONEY_HINTS.some((h) => c.includes(h))) return "money";
  return "number";
}

function labelFor(column: string, kind: SummaryEntry["kind"]): string {
  const c = column.toLowerCase();
  if (kind === "hours" && (c === "stunden" || c.includes("gesamtstunden"))) return "Gesamtstunden";
  if (c === "lohn") return "Gesamtlohn";
  if (column.toLowerCase().startsWith("gesamt")) return column;
  return `Gesamt ${column}`;
}

const NUM_FMT = new Intl.NumberFormat("de-DE-u-ca-gregory-nu-latn", {
  numberingSystem: "latn",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatSummaryValue(entry: SummaryEntry): string {
  const value = NUM_FMT.format(entry.total);
  if (entry.kind === "money") return `${value} €`;
  if (entry.kind === "hours") return `${value} Std.`;
  return value;
}

/**
 * Ermittelt automatisch alle summierbaren Spalten einer Tabelle und deren Endsummen.
 * Eine Spalte gilt als summierbar, wenn der überwiegende Teil der Werte numerisch ist.
 */
export function summarizeRows(rows: TableRow[]): SummaryEntry[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0] ?? {});
  const entries: SummaryEntry[] = [];
  for (const column of headers) {
    const c = column.toLowerCase();
    if (EXCLUDE_HINTS.some((h) => c.includes(h))) continue;
    let numeric = 0;
    let filled = 0;
    let total = 0;
    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined || String(value).trim() === "") continue;
      filled += 1;
      if (isNumericValue(value)) {
        numeric += 1;
        total += parseDeNumber(value);
      }
    }
    if (filled === 0 || numeric / filled < 0.8) continue;
    if (total === 0) continue;
    const kind = classify(column);
    entries.push({ column, label: labelFor(column, kind), total, kind });
  }
  return entries;
}

/** Textzeilen des Zusammenfassungsblocks, z. B. für CSV oder PDF-Kopf. */
export function summaryLines(rows: TableRow[]): string[] {
  const entries = summarizeRows(rows);
  const lines = [`Datensätze: ${rows.length}`];
  for (const entry of entries) lines.push(`${entry.label}: ${formatSummaryValue(entry)}`);
  return lines;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * Baut eine CSV-Datei mit vorangestelltem Zusammenfassungsblock (Endsummen ganz oben).
 */
export function buildCsvWithSummary(
  rows: TableRow[],
  options?: { title?: string; separator?: string; eol?: string },
): string {
  if (rows.length === 0) return "";
  const sep = options?.separator ?? ";";
  const eol = options?.eol ?? "\r\n";
  const headers = Object.keys(rows[0]!);
  const lines: string[] = [];
  if (options?.title) lines.push(csvEscape(options.title));
  lines.push(csvEscape("Zusammenfassung (Endsummen)"));
  for (const line of summaryLines(rows)) {
    const [label, ...rest] = line.split(": ");
    lines.push([csvEscape(label), csvEscape(rest.join(": "))].join(sep));
  }
  lines.push("");
  lines.push(headers.map(csvEscape).join(sep));
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(sep));
  return lines.join(eol);
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML-Zusammenfassungsblock für Excel-/HTML-Exporte. */
export function summaryHtml(rows: TableRow[], title?: string): string {
  if (rows.length === 0) return "";
  const cells = summaryLines(rows)
    .map((line) => {
      const [label, ...rest] = line.split(": ");
      return `<tr><td><b>${esc(label)}</b></td><td>${esc(rest.join(": "))}</td></tr>`;
    })
    .join("");
  return `<p><b>Zusammenfassung${title ? ` – ${esc(title)}` : ""} (Endsummen)</b></p><table border="1">${cells}</table>`;
}
