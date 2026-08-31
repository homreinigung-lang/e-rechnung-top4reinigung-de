/**
 * Echte Exportfunktionen für die LV-Analyse: CSV, XLSX und PDF-Bericht.
 * Es werden ausschließlich die zuletzt bearbeiteten und freigegebenen Positionen exportiert.
 * Fehlende oder unsichere Werte werden nicht erfunden, sondern mit
 * „Prüfung erforderlich“ gekennzeichnet.
 */
import JSZip from "jszip";
import {
  CALC_STATUS_LABELS,
  NO_OWN_PRICE_LABEL,
  calcStatus,
  hasOwnPrice,
  offerPrice,
  summarizeOwnCalculation,
} from "./calculation";
import { DOCUMENT_KIND_LABELS, type LvAnalysisResult, type LvNormalizedItem } from "./types";

export const REVIEW_LABEL = "Prüfung erforderlich";

/** Schwelle, ab der ein erkannter Wert als unsicher gilt. */
export const CONFIDENCE_THRESHOLD = 0.5;

export type ReviewField =
  | "description"
  | "quantity"
  | "unit"
  | "frequency"
  | "area_m2"
  | "unit_price"
  | "total_price";

/**
 * Liefert alle Felder einer Position, die leer oder unsicher sind.
 * Unsichere Positionen (confidence < 0.5) markieren alle Wertfelder zur Prüfung,
 * damit keine automatisch geratenen Zahlen als gesichert gelten.
 */
export function reviewFields(item: LvNormalizedItem): ReviewField[] {
  const out = new Set<ReviewField>();
  if (!item.description.trim()) out.add("description");
  if (item.quantity === null || item.quantity <= 0) out.add("quantity");
  if (!item.unit.trim()) out.add("unit");
  if (item.frequency.perYear === null) out.add("frequency");
  if (item.area_m2 === null) out.add("area_m2");
  if (item.unit_price === null || item.unit_price <= 0) out.add("unit_price");
  if (item.total_price === null || item.total_price <= 0) out.add("total_price");
  if (item.source_method !== "manuell" && item.confidence_score < CONFIDENCE_THRESHOLD) {
    (["quantity", "unit", "frequency", "area_m2", "unit_price", "total_price"] as ReviewField[]).forEach((f) =>
      out.add(f),
    );
  }
  return [...out];
}

export function needsReview(item: LvNormalizedItem): boolean {
  return reviewFields(item).length > 0;
}

/** Export ist erst nach abgeschlossener oder teilweise abgeschlossener Analyse möglich. */
export function canExport(result: LvAnalysisResult | null, items: LvNormalizedItem[]): boolean {
  if (!result) return false;
  if (result.status !== "success" && result.status !== "partial") return false;
  return items.length > 0 || result.totals.length > 0;
}

/**
 * Auswahl der zu exportierenden Positionen: ausschließlich freigegebene Positionen
 * der aktuellen Analyse. Positionen früherer Uploads werden nie exportiert.
 */
export function selectExportItems(
  items: LvNormalizedItem[],
  analysisId?: string | null,
): LvNormalizedItem[] {
  return items.filter(
    (i) => i.approved && (!analysisId || i.analysis_id === analysisId) && hasOwnPrice(i),
  );
}

/** Spalten der Ausschreibung (geforderte Daten aus dem Dokument). */
export const TENDER_HEADERS = [
  "Pos.",
  "Beschreibung",
  "Kategorie",
  "Geforderte Menge",
  "Einheit",
  "Intervall",
  "Einsätze/Jahr",
  "Fläche (m²)",
  "Geforderte Arbeitsstunden",
  "Seite",
  "Sicherheitswert",
  "Hinweis",
] as const;

/** Spalten der eigenen Kalkulation. */
export const CALCULATION_HEADERS = [
  "Eigener Einheitspreis (€)",
  "Eigene Arbeitskosten (€)",
  "Materialkosten (€)",
  "Gemeinkosten (€)",
  "Gewinn (%)",
  "Angebotspreis (€)",
  "Kalkulationsstatus",
] as const;

export const EXPORT_HEADERS = [...TENDER_HEADERS, ...CALCULATION_HEADERS] as const;

const num = (v: number | null, field: ReviewField, review: ReviewField[]): string =>
  review.includes(field) || v === null ? REVIEW_LABEL : String(v).replace(".", ",");

const own = (v: number | null): string => (v === null ? "" : String(v).replace(".", ","));

/** Baut die Exportzeilen (identisch für CSV, XLSX und PDF). */
export function buildExportRows(items: LvNormalizedItem[]): string[][] {
  return items.map((item) => {
    const review = reviewFields(item);
    const price = offerPrice(item);
    return [
      item.item_number || REVIEW_LABEL,
      item.description.trim() || REVIEW_LABEL,
      item.category,
      num(item.quantity, "quantity", review),
      review.includes("unit") ? REVIEW_LABEL : item.unit,
      review.includes("frequency") ? REVIEW_LABEL : item.frequency.label || REVIEW_LABEL,
      review.includes("frequency") || item.frequency.perYear === null
        ? REVIEW_LABEL
        : String(item.frequency.perYear),
      num(item.area_m2, "area_m2", review),
      num(item.working_hours, "area_m2", []),
      item.source_page === null ? REVIEW_LABEL : String(item.source_page),
      String(Math.round(item.confidence_score * 100)),
      review.length ? `${REVIEW_LABEL}: ${review.join(", ")}` : "geprüft",
      hasOwnPrice(item) ? own(item.calculation.own_unit_price) : NO_OWN_PRICE_LABEL,
      own(item.calculation.labor_cost),
      own(item.calculation.material_cost),
      own(item.calculation.overhead_cost),
      own(item.calculation.profit_percent),
      price === null ? NO_OWN_PRICE_LABEL : own(price),
      CALC_STATUS_LABELS[calcStatus(item)],
    ];
  });
}

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV im Standardformat des Systems: UTF-8 mit BOM, Semikolon-getrennt. */
export function buildCsv(items: LvNormalizedItem[], result?: LvAnalysisResult | null): string {
  const lines: string[][] = [];
  if (result) {
    lines.push(["Datei", result.fileName]);
    lines.push(["Dokumenttyp", DOCUMENT_KIND_LABELS[result.kind].de]);
    lines.push(["Status", result.statusMessage]);
    lines.push([]);
    if (result.totals.length) {
      lines.push(["Erkannte Summen"]);
      lines.push(["Bezeichnung", "Betrag €", "Quellseite"]);
      for (const t of result.totals) {
        lines.push([t.label, String(t.amount).replace(".", ","), t.source_page === null ? REVIEW_LABEL : String(t.source_page)]);
      }
      lines.push([]);
    }
  }
  lines.push([...EXPORT_HEADERS]);
  lines.push(...buildExportRows(items));
  return `\uFEFF${lines.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const colName = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const isNumber = value !== "" && value !== REVIEW_LABEL && /^-?\d+(,\d+)?$/.test(value);
          if (isNumber) return `<c r="${ref}"><v>${value.replace(",", ".")}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** Erzeugt eine echte XLSX-Datei (OOXML, inline strings) als Blob. */
export async function buildXlsx(
  items: LvNormalizedItem[],
  result?: LvAnalysisResult | null,
): Promise<Blob> {
  const rows: string[][] = [];
  if (result) {
    rows.push(["Datei", result.fileName]);
    rows.push(["Dokumenttyp", DOCUMENT_KIND_LABELS[result.kind].de]);
    rows.push(["Status", result.statusMessage]);
    rows.push([]);
  }
  rows.push([...EXPORT_HEADERS]);
  rows.push(...buildExportRows(items));
  if (result?.totals.length) {
    rows.push([]);
    rows.push(["Erkannte Summen", "Betrag €", "Quellseite"]);
    for (const t of result.totals) {
      rows.push([t.label, String(t.amount).replace(".", ","), t.source_page === null ? REVIEW_LABEL : String(t.source_page)]);
    }
  }

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="LV-Analyse" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file("xl/worksheets/sheet1.xml", sheetXml(rows));

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export type PdfReportSummary = {
  totalArea: number;
  totalHours: number;
  totalCost: number;
};

/** Erzeugt einen echten PDF-Bericht (Vektor, jsPDF) als Blob. */
export async function buildPdfReport(
  result: LvAnalysisResult,
  items: LvNormalizedItem[],
  summary: PdfReportSummary,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Analysebericht Leistungsverzeichnis", marginX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Datei: ${result.fileName}`, marginX, y);
  y += 4.5;
  doc.text(`Dokumenttyp: ${DOCUMENT_KIND_LABELS[result.kind].de}`, marginX, y);
  y += 4.5;
  doc.text(`Status: ${result.statusMessage}`, marginX, y);
  y += 4.5;
  doc.text(
    `Freigegebene Positionen: ${items.length} · Fläche: ${summary.totalArea.toLocaleString("de-DE")} m² · Stunden: ${summary.totalHours.toLocaleString("de-DE")} · Summe: ${summary.totalCost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
    marginX,
    y,
  );
  y += 4.5;
  doc.setTextColor(150, 60, 0);
  doc.text(`Hinweis: Mit „${REVIEW_LABEL}“ gekennzeichnete Felder wurden nicht sicher erkannt.`, marginX, y);
  doc.setTextColor(0, 0, 0);
  y += 7;

  const cols: { title: string; w: number; align?: "right" }[] = [
    { title: "Pos.", w: 18 },
    { title: "Beschreibung", w: 88 },
    { title: "Menge", w: 22, align: "right" },
    { title: "Einheit", w: 16 },
    { title: "Intervall", w: 28 },
    { title: "m²", w: 20, align: "right" },
    { title: "Std.", w: 18, align: "right" },
    { title: "EP €", w: 20, align: "right" },
    { title: "GP €", w: 22, align: "right" },
    { title: "Seite", w: 14, align: "right" },
    { title: "Sich. %", w: 16, align: "right" },
  ];

  const drawHead = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = marginX;
    for (const col of cols) {
      doc.text(col.title, col.align === "right" ? x + col.w - 2 : x, y, { align: col.align ?? "left" });
      x += col.w;
    }
    y += 2;
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW - marginX, y);
    y += 4;
    doc.setFont("helvetica", "normal");
  };
  drawHead();

  const rows = buildExportRows(items);
  for (const row of rows) {
    if (y > pageH - 16) {
      doc.addPage();
      y = 16;
      drawHead();
    }
    const values = [row[0], row[1], row[3], row[4], row[5], row[7], row[8], row[9], row[10], row[12], row[13]];
    let x = marginX;
    values.forEach((raw, index) => {
      const col = cols[index]!;
      const value = raw ?? "";
      const short = value === REVIEW_LABEL ? "prüfen" : value;
      const text = doc.splitTextToSize(short, col.w - 3)[0] ?? "";
      if (value === REVIEW_LABEL) doc.setTextColor(190, 60, 0);
      doc.text(String(text), col.align === "right" ? x + col.w - 2 : x, y, { align: col.align ?? "left" });
      doc.setTextColor(0, 0, 0);
      x += col.w;
    });
    y += 4.4;
  }

  if (result.totals.length) {
    if (y > pageH - 30) {
      doc.addPage();
      y = 16;
    }
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Erkannte Summen (Preisblatt)", marginX, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    for (const total of result.totals) {
      if (y > pageH - 14) {
        doc.addPage();
        y = 16;
      }
      doc.text(`${total.label}`, marginX, y);
      doc.text(`${total.amount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`, marginX + 120, y, {
        align: "right",
      });
      doc.text(total.source_page === null ? REVIEW_LABEL : `Seite ${total.source_page}`, marginX + 130, y);
      y += 4.4;
    }
  }

  return doc.output("blob");
}

/** Löst einen Datei-Download im Browser aus. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBaseName(result: LvAnalysisResult | null): string {
  const raw = (result?.fileName ?? "lv-analyse").replace(/\.[^.]+$/, "");
  return `LV-Analyse_${raw.replace(/[^\w\-]+/g, "_").slice(0, 60)}`;
}
