import { toast } from "sonner";

import { saveFile } from "@/lib/download";

import { escapeExcelHtml, excelHtmlCell } from "@/lib/excel-html";

import {
  buildCsvBlob,
  filterRowsByDateRange,
  summaryHtml,
  type DateRange,
} from "@/lib/table-summary";

export type Row = Record<string, string>;

export function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function download(name: string, blob: Blob) {
  void saveFile(blob, name);
}

export function downloadCsv(name: string, rows: Row[], range?: DateRange) {
  // Strikte Datumsfilterung + Endsummen oben + UTF-8-BOM/Semikolon (Excel-tauglich).
  const blob = buildCsvBlob(rows, { title: name.replace(/\.csv$/i, ""), range });
  if (!blob) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  download(name, blob);
}

export function downloadExcel(
  name: string,
  sheets: { title: string; rows: Row[] }[],
  range?: DateRange,
) {
  sheets = sheets.map((s) => ({ ...s, rows: filterRowsByDateRange(s.rows, range) }));
  const filled = sheets.filter((s) => s.rows.length > 0);
  const tables = filled
    .map((s) => {
      const headers = Object.keys(s.rows[0]!);
      return `<h3>${escapeExcelHtml(s.title)}</h3>${summaryHtml(s.rows, s.title)}<table border="1"><tr>${headers
        .map((h) => `<th>${escapeExcelHtml(h)}</th>`)
        .join("")}</tr>${s.rows
        .map((r) => `<tr>${headers.map((h) => excelHtmlCell(r[h])).join("")}</tr>`)
        .join("")}</table>`;
    })
    .join("<br/>");
  if (!tables) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  // Gesamtübersicht aller Blätter zuerst.
  const overview = filled
    .map((s) => `<h4>${escapeExcelHtml(s.title)}</h4>${summaryHtml(s.rows, s.title)}`)
    .join("");
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><h2>Zusammenfassung (Endsummen)</h2>${overview}<hr/>${tables}</body></html>`;
  download(name, new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

export function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

export function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}

export const STEUERBERATER_RECHTE = [
  { label: "Rechnungen", erlaubt: true },
  { label: "Ausgaben", erlaubt: true },
  { label: "DATEV-Export", erlaubt: true },
  { label: "DATEV-Einstellungen (SKR, Berater-/Mandantennummer)", erlaubt: true },
  { label: "Excel-Export", erlaubt: true },
  { label: "PDF-Belege", erlaubt: true },
  { label: "Bearbeitung der Unternehmensdaten", erlaubt: false },
];
