// Robuster CSV-Import für Lexware/Lexoffice-Exporte (Rechnungen, Ausgaben, Kunden).
// Erkennt Kodierung (UTF-8 / ISO-8859-1), Trennzeichen und Dateityp automatisch
// und überspringt unbekannte Spalten, statt den Import abzubrechen.

export type ImportKind = "documents" | "expenses" | "customers";

/** Liest die Datei und wählt UTF-8, Windows-1252 oder ISO-8859-1 automatisch. */
export async function readTextAuto(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // BOM => sicher UTF-8
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const strict = new TextDecoder("utf-8", { fatal: true });
  try {
    return strict.decode(bytes);
  } catch {
    for (const enc of ["windows-1252", "iso-8859-15", "iso-8859-1"]) {
      try {
        return new TextDecoder(enc).decode(bytes);
      } catch {
        // nächste Kodierung versuchen
      }
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Zählt Trennzeichen außerhalb von Anführungszeichen. */
function countOutsideQuotes(line: string, sep: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === sep) count++;
  }
  return count;
}

/** Erkennt ; , Tab oder | anhand der ersten Datenzeilen. */
export function detectSeparator(text: string): string {
  const lines = text
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 5);
  if (lines.length === 0) return ";";
  const scored = [";", ",", "\t", "|"].map((sep) => {
    const counts = lines.map((l) => countOutsideQuotes(l, sep));
    const total = counts.reduce((a, b) => a + b, 0);
    const consistent = counts.every((c) => c === counts[0]) ? 1 : 0;
    return { sep, total, consistent };
  });
  scored.sort((a, b) => b.consistent - a.consistent || b.total - a.total);
  const best = scored[0]!;
  return best.total > 0 ? best.sep : ";";
}

/** CSV-Parser mit Unterstützung für Anführungszeichen und Zeilenumbrüche in Feldern. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const sep = detectSeparator(clean);


  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s._"']/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]/g, "");
}

export type Record_ = Record<string, string>;

export function toObjects(headers: string[], rows: string[][]): Record_[] {
  const keys = headers.map(norm);
  return rows.map((cells) => {
    const obj: Record_ = {};
    keys.forEach((k, i) => {
      if (!k) return;
      const value = (cells[i] ?? "").trim();
      if (value && !obj[k]) obj[k] = value;
    });
    return obj;
  });
}

/**
 * Sucht einen Wert unabhängig von der exakten Spaltenbezeichnung:
 * exakter Treffer > Spalte enthält den Begriff > Begriff enthält die Spalte.
 */
function pick(row: Record_, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const key = norm(c);
    if (row[key]) return row[key]!;
  }
  for (const c of candidates) {
    const key = norm(c);
    if (!key) continue;
    const hit = keys.find((k) => k.includes(key));
    if (hit && row[hit]) return row[hit]!;
  }
  for (const c of candidates) {
    const key = norm(c);
    if (key.length < 4) continue;
    const hit = keys.find((k) => k.length >= 4 && key.includes(k));
    if (hit && row[hit]) return row[hit]!;
  }
  return "";
}


/** Deutsche Zahl ("1.234,56 €") => number */
export function parseNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return 0;
  const normalized =
    cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Datum in TT.MM.JJJJ / JJJJ-MM-TT => ISO (JJJJ-MM-TT) */
export function parseDate(value: string): string | null {
  const v = (value ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/.exec(v);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

const DOC_HINTS = ["rechnungsnummer", "belegnummer", "rechnungsdatum", "belegdatum", "gesamtbetrag", "bruttobetrag"];
const EXPENSE_HINTS = ["lieferant", "kreditor", "eingangsrechnung", "ausgabe", "aufwand", "kategorie"];
const CUSTOMER_HINTS = ["kundennummer", "firma", "ansprechpartner", "plz", "ort", "strasse", "ustidnr"];

/** Erkennt anhand von Dateiname + Spalten, worum es sich handelt. */
export function detectKind(fileName: string, headers: string[]): ImportKind {
  const name = fileName.toLowerCase();
  if (/export_ra|_ra_|ausgab|eingangsrechnung|lieferant/.test(name)) return "expenses";
  if (/export_re|_re_|rechnung|ausgangsrechnung|beleg/.test(name)) return "documents";
  if (/kunde|kontakt|adress|customer/.test(name)) return "customers";

  const keys = headers.map(norm);
  const score = (hints: string[]) =>
    hints.reduce((sum, h) => sum + (keys.some((k) => k.includes(norm(h))) ? 1 : 0), 0);
  const expense = score(EXPENSE_HINTS);
  const doc = score(DOC_HINTS);
  const customer = score(CUSTOMER_HINTS);
  if (expense >= doc && expense >= customer && expense > 0) return "expenses";
  if (doc >= customer && doc > 0) return "documents";
  return "customers";
}

export type CustomerRow = {
  name: string;
  company: string;
  email: string;
  phone: string;
  address_line: string;
  postal_code: string;
  city: string;
  country: string;
  vat_id: string;
  notes: string;
};

export function mapCustomer(row: Record_): CustomerRow | null {
  const company = pick(row, ["Firma", "Firmenname", "Company", "Unternehmen", "Name1", "Kunde"]);
  const name = pick(row, ["Ansprechpartner", "Name", "Nachname", "Kontakt", "Vorname"]);
  if (!company && !name) return null;
  return {
    name,
    company,
    email: pick(row, ["E-Mail", "Email", "Mail", "E-Mail-Adresse"]),
    phone: pick(row, ["Telefon", "Phone", "Tel", "Telefonnummer"]),
    address_line: pick(row, ["Straße", "Strasse", "Adresse", "Anschrift", "Street"]),
    postal_code: pick(row, ["PLZ", "Postleitzahl", "Zip"]),
    city: pick(row, ["Ort", "Stadt", "City"]),
    country: pick(row, ["Land", "Country"]) || "Deutschland",
    vat_id: pick(row, ["USt-IdNr.", "USt-IdNr", "UStID", "Umsatzsteuer-ID", "VAT"]),
    notes: pick(row, ["Notizen", "Bemerkung", "Notiz"]),
  };
}

export type DocumentRow = {
  type: "invoice" | "quote";
  number: string;
  status: "draft" | "sent" | "paid";
  issue_date: string;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  customer_address_line: string;
  customer_postal_code: string;
  customer_city: string;
  customer_country: string;
  customer_vat_id: string;
  order_number: string;
  tax_mode: string;
  vat_rate: number;
  net_total: number;
  vat_amount: number;
  total: number;
  notes: string;
};

export function mapDocument(row: Record_): DocumentRow | null {
  const number = pick(row, ["Rechnungsnummer", "Belegnummer", "Nummer", "Nr", "Dokumentnummer"]);
  const date = parseDate(pick(row, ["Rechnungsdatum", "Belegdatum", "Datum", "Ausstellungsdatum"]));
  const company = pick(row, ["Kunde", "Firma", "Empfänger", "Name1", "Kundenname"]);
  let net = parseNumber(pick(row, ["Netto", "Nettobetrag", "Nettosumme", "Betrag netto"]));
  const vat = parseNumber(pick(row, ["Umsatzsteuer", "MwSt", "Steuer", "Steuerbetrag", "USt"]));
  let gross = parseNumber(pick(row, ["Brutto", "Bruttobetrag", "Gesamtbetrag", "Gesamt", "Betrag"]));
  if (!gross && (net || vat)) gross = net + vat;
  if (!net && gross) net = gross - vat;
  if (!number && !date && !company && !gross) return null;

  const typeRaw = norm(pick(row, ["Belegart", "Typ", "Art", "Dokumenttyp"]));
  const statusRaw = norm(pick(row, ["Status", "Zahlstatus"]));
  return {
    type: typeRaw.includes("angebot") || typeRaw.includes("quote") ? "quote" : "invoice",
    number: number || `IMP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: statusRaw.includes("bezahlt") || statusRaw.includes("paid")
      ? "paid"
      : statusRaw.includes("offen") || statusRaw.includes("versend") || statusRaw.includes("sent")
        ? "sent"
        : "draft",
    issue_date: date ?? new Date().toISOString().slice(0, 10),
    customer_name: pick(row, ["Ansprechpartner", "Kontakt"]),
    customer_company: company,
    customer_email: pick(row, ["E-Mail", "Email", "Mail"]),
    customer_address_line: pick(row, ["Straße", "Strasse", "Adresse", "Anschrift"]),
    customer_postal_code: pick(row, ["PLZ", "Postleitzahl"]),
    customer_city: pick(row, ["Ort", "Stadt"]),
    customer_country: pick(row, ["Land"]) || "Deutschland",
    customer_vat_id: pick(row, ["USt-IdNr.", "UStID", "VAT"]),
    order_number: pick(row, ["Bestellnummer", "Auftragsnummer", "Bestell-Nr"]),
    tax_mode: vat > 0 ? "domestic" : "eu_reverse_charge",
    vat_rate: vat > 0 && net > 0 ? Math.round((vat / net) * 100) : 0,
    net_total: net,
    vat_amount: vat,
    total: gross || net,
    notes: pick(row, ["Notizen", "Bemerkung", "Beschreibung", "Text"]),
  };
}

export type ExpenseRow = {
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  notes: string;
};

export function mapExpense(row: Record_): ExpenseRow | null {
  const supplier = pick(row, ["Lieferant", "Kreditor", "Firma", "Name", "Empfänger", "Zahlungsempfänger"]);
  const date = parseDate(pick(row, ["Belegdatum", "Rechnungsdatum", "Datum", "Buchungsdatum"]));
  let net = parseNumber(pick(row, ["Netto", "Nettobetrag", "Betrag netto"]));
  const vat = parseNumber(pick(row, ["Vorsteuer", "Umsatzsteuer", "MwSt", "Steuer", "Steuerbetrag"]));
  let gross = parseNumber(pick(row, ["Brutto", "Bruttobetrag", "Gesamtbetrag", "Betrag", "Gesamt"]));
  if (!gross && (net || vat)) gross = net + vat;
  if (!net && gross) net = gross - vat;
  if (!supplier && !gross && !date) return null;
  return {
    supplier: supplier || "Unbekannt",
    expense_date: date ?? new Date().toISOString().slice(0, 10),
    category: pick(row, ["Kategorie", "Kostenart", "Konto", "Sachkonto"]) || "Sonstiges",
    document_number: pick(row, ["Belegnummer", "Rechnungsnummer", "Nummer", "Nr"]),
    net_amount: net,
    vat_amount: vat,
    gross_amount: gross || net,
    notes: pick(row, ["Notizen", "Bemerkung", "Beschreibung", "Text", "Verwendungszweck"]),
  };
}
