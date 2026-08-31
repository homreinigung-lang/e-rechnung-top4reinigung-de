import JSZip from "jszip";
import { parseGermanNumber } from "./number";

/**
 * Einlesen und Erkennen von Leistungsverzeichnissen aus PDF, TXT/CSV und Excel.
 * Läuft im Browser; PDF-Text wird mit pdfjs gelesen (kein Server nötig).
 */

export type LvImportItem = {
  item_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type ExtractResult = {
  /** Erkannter Dateityp. */
  kind: "pdf" | "text" | "table";
  /** Zusammengesetzter Klartext (auch bei Tabellen, für die KI-Analyse). */
  text: string;
  /** Tabellenzeilen (nur bei CSV/Excel). */
  rows: string[][];
  /** PDF mit brauchbarer Textebene? */
  hasTextLayer: boolean;
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Liest den Text eines PDFs zeilenweise (Positionen bleiben in einer Zeile). */
async function readPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out: string[] = [];
  const maxPages = Math.min(doc.numPages, 60);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pieces = content.items
      .map((raw) => {
        const item = raw as { str?: string; transform?: number[] };
        const t = item.transform ?? [];
        return { text: String(item.str ?? ""), x: Number(t[4] ?? 0), y: Number(t[5] ?? 0) };
      })
      .filter((piece) => piece.text.trim().length > 0);

    const lines: { y: number; parts: { x: number; text: string }[] }[] = [];
    for (const piece of pieces) {
      const line = lines.find((l) => Math.abs(l.y - piece.y) <= 2.5);
      if (line) line.parts.push(piece);
      else lines.push({ y: piece.y, parts: [piece] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const line of lines) {
      line.parts.sort((a, b) => a.x - b.x);
      out.push(line.parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim());
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/** Trennt eine CSV-Zeile an ; , oder Tab (das häufigste Trennzeichen gewinnt). */
function splitCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const counts = [";", "\t", ","].map((sep) => ({
    sep,
    n: lines.slice(0, 20).reduce((s, l) => s + l.split(sep).length - 1, 0),
  }));
  counts.sort((a, b) => b.n - a.n);
  const sep = counts[0] && counts[0].n > 0 ? counts[0].sep : ";";
  return lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}

/** Minimaler XLSX-Leser (erste Tabelle) – ohne zusätzliche Abhängigkeit. */
async function readXlsx(file: File): Promise<string[][]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared: string[] = [];
  for (const si of sharedXml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "");
    shared.push(
      texts
        .join("")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    );
  }

  const sheetName =
    Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) ??
    Object.keys(zip.files).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!sheetName) return [];
  const sheetXml = (await zip.file(sheetName)?.async("string")) ?? "";

  const rows: string[][] = [];
  for (const rowXml of sheetXml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const ref = /r="([A-Z]+)\d+"/.exec(cellXml)?.[1] ?? "";
      let index = 0;
      for (const ch of ref) index = index * 26 + (ch.charCodeAt(0) - 64);
      index = Math.max(0, index - 1);
      const type = /t="([^"]+)"/.exec(cellXml)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") {
        value = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "").join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      while (cells.length < index) cells.push("");
      cells[index] = value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim();
    }
    if (cells.some((c) => c)) rows.push(cells);
  }
  return rows;
}

/** Liest eine hochgeladene Datei ein und liefert Text bzw. Tabellenzeilen. */
export async function extractDocument(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const rows = await readXlsx(file);
    return {
      kind: "table",
      rows,
      text: rows.map((r) => r.join(" | ")).join("\n"),
      hasTextLayer: rows.length > 0,
    };
  }

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.startsWith("text/")) {
    const text = await file.text();
    const rows = name.endsWith(".csv") ? splitCsv(text) : [];
    return { kind: rows.length ? "table" : "text", rows, text, hasTextLayer: text.trim().length > 0 };
  }

  const text = await readPdfText(file);
  return { kind: "pdf", rows: [], text, hasTextLayer: text.replace(/\s/g, "").length >= 60 };
}

const HEAD_PATTERNS: { key: keyof LvImportItem; words: string[] }[] = [
  { key: "item_number", words: ["oz", "pos", "position", "positionsnummer", "nr", "ordnungszahl"] },
  {
    key: "description",
    words: ["beschreibung", "bezeichnung", "leistung", "text", "kurztext", "positionstext"],
  },
  { key: "quantity", words: ["menge", "anzahl", "stück", "stueck", "umfang"] },
  { key: "unit", words: ["einheit", "me", "mengeneinheit", "einh"] },
  { key: "unit_price", words: ["einheitspreis", "ep", "preis/einheit", "preis je", "einzelpreis"] },
];

function normHead(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9/ ]/g, "")
    .trim();
}

/**
 * Erkennt LV-Positionen in Tabellenzeilen (CSV/Excel) anhand der Spaltenüberschriften.
 * Es werden ausschließlich vorhandene Werte übernommen – nichts wird geschätzt.
 */
export function itemsFromRows(rows: string[][]): LvImportItem[] {
  if (rows.length < 2) return [];

  let headerIndex = -1;
  let map: Partial<Record<keyof LvImportItem, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] ?? []).map(normHead);
    const found: Partial<Record<keyof LvImportItem, number>> = {};
    cells.forEach((cell, c) => {
      if (!cell) return;
      for (const pattern of HEAD_PATTERNS) {
        if (found[pattern.key] !== undefined) continue;
        if (pattern.words.some((w) => cell === w || cell.startsWith(`${w} `) || cell.includes(w))) {
          found[pattern.key] = c;
        }
      }
    });
    if (found.description !== undefined && (found.quantity !== undefined || found.item_number !== undefined)) {
      headerIndex = r;
      map = found;
      break;
    }
  }
  if (headerIndex < 0) return [];

  const items: LvImportItem[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const at = (key: keyof LvImportItem) => {
      const index = map[key];
      return index === undefined ? "" : String(row[index] ?? "").trim();
    };
    const description = at("description");
    const itemNumber = at("item_number");
    if (!description && !itemNumber) continue;
    if (!description) continue;
    items.push({
      item_number: itemNumber,
      description,
      quantity: parseGermanNumber(at("quantity")),
      unit: at("unit"),
      unit_price: parseGermanNumber(at("unit_price")),
    });
  }
  return items;
}

const UNIT_WORDS =
  "m²|m2|qm|m³|m3|lfm|lfdm|m|stk|stück|st|psch|pausch|pauschal|std|h|monat|mon|jahr|kg|l|ltr|pos|einh";

/**
 * Regelbasierte Erkennung direkt aus PDF-Text: „01.0010  Reinigung …  1.250,00  m²".
 * Dient als Rückfallebene, wenn die KI nichts liefert. Erfindet keine Werte.
 */
export function itemsFromText(text: string): LvImportItem[] {
  const items: LvImportItem[] = [];
  const lineRe = new RegExp(
    String.raw`^\s*(\d{1,3}(?:[.\-]\d{1,4}){0,3}|\d{1,4})[.)]?\s+(.{4,200}?)\s+([\d.]+,\d+|\d+)\s*(${UNIT_WORDS})\b`,
    "i",
  );
  const altRe = new RegExp(
    String.raw`^\s*(\d{1,3}(?:[.\-]\d{1,4}){0,3}|\d{1,4})[.)]?\s+(.{4,200}?)\s+(${UNIT_WORDS})\s+([\d.]+,\d+|\d+)\b`,
    "i",
  );

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 8) continue;
    const m = lineRe.exec(line);
    if (m) {
      items.push({
        item_number: m[1] ?? "",
        description: (m[2] ?? "").trim(),
        quantity: parseGermanNumber(m[3] ?? ""),
        unit: (m[4] ?? "").trim(),
        unit_price: 0,
      });
      continue;
    }
    const a = altRe.exec(line);
    if (a) {
      items.push({
        item_number: a[1] ?? "",
        description: (a[2] ?? "").trim(),
        quantity: parseGermanNumber(a[4] ?? ""),
        unit: (a[3] ?? "").trim(),
        unit_price: 0,
      });
    }
  }
  return items;
}

/** Entfernt Dubletten und offensichtlich leere Positionen. */
export function cleanItems(items: LvImportItem[]): LvImportItem[] {
  const seen = new Set<string>();
  const out: LvImportItem[] = [];
  for (const item of items) {
    const description = item.description.trim();
    if (!description) continue;
    const key = `${item.item_number}|${description.toLowerCase()}|${item.quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, description });
  }
  return out;
}

/** Datei als Base64 (ohne data:-Präfix) – für die OCR-Analyse gescannter PDFs. */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
