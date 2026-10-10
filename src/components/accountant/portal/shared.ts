import { type Row } from "@/lib/accountant.functions";

import { toast } from "sonner";
import { formatDate, formatMoney } from "@/lib/format";

import { saveFile } from "@/lib/download";

import { escapeExcelHtml, excelHtmlCell } from "@/lib/excel-html";

import {
  buildCsvBlob,
  filterRowsByDateRange,
  summaryHtml,
  type DateRange,
} from "@/lib/table-summary";

export type Table = Record<string, string>;

export function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

export function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}

export function parseDe(v: unknown) {
  return (
    Number(
      String(v ?? "")
        .replace(/\./g, "")
        .replace(",", "."),
    ) || 0
  );
}

export function download(name: string, blob: Blob) {
  void (async () => {
    try {
      await saveFile(blob, name);
    } catch (e) {
      toast.error(`Download fehlgeschlagen: ${(e as Error).message}`);
    }
  })();
}

export function downloadCsv(name: string, rows: Table[], range?: DateRange) {
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
  sheets: { title: string; rows: Table[] }[],
  range?: DateRange,
) {
  sheets = sheets.map((s) => ({ ...s, rows: filterRowsByDateRange(s.rows, range) }));
  const tables = sheets
    .filter((s) => s.rows.length > 0)
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
  download(
    name,
    new Blob([`\uFEFF<html><head><meta charset="utf-8" /></head><body>${tables}</body></html>`], {
      type: "application/vnd.ms-excel;charset=utf-8",
    }),
  );
}

export async function exportHoursPdf(
  filename: string,
  title: string,
  companyName: string,
  entries: Row[],
) {
  if (entries.length === 0) {
    toast.error("Keine Arbeitszeiten im gewählten Zeitraum.");
    return;
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;
  doc.setFontSize(15);
  doc.text(title, 15, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`${companyName || "Stundenübersicht"} · Stunden je Mitarbeiter`, 15, y);
  y += 10;

  const per = new Map<
    string,
    { hours: number; amount: number; sick: number; vacation: number; personnel: string }
  >();
  for (const e of entries) {
    const name = String(e["employee_name"] || "Ohne Zuordnung");
    const code = String(e["lohnart"] ?? "A");
    const approved = String(e["approval_status"] ?? "approved") === "approved";
    const h = code === "A" && approved ? num(e["hours"]) : 0;
    const cur = per.get(name) ?? { hours: 0, amount: 0, sick: 0, vacation: 0, personnel: "" };
    per.set(name, {
      hours: cur.hours + h,
      amount: cur.amount + h * num(e["hourly_rate"]),
      sick: cur.sick + (approved && code === "K" ? 1 : 0),
      vacation: cur.vacation + (approved && code === "U" ? 1 : 0),
      personnel: cur.personnel || String(e["personnel_number"] || ""),
    });
  }

  // Kompakte Abrechnungs-Zusammenfassung direkt in der Kopfzeile.
  const sumH = [...per.values()].reduce((s, v) => s + v.hours, 0);
  const sumA = [...per.values()].reduce((s, v) => s + v.amount, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Gesamtstunden: ${de(sumH)} Std.    Gesamtlohn: ${formatMoney(sumA)}`, 15, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  doc.setFontSize(10);
  doc.text("Mitarbeiter (Personal-Nr.)", 15, y);
  doc.text("Krank (K)", 100, y, { align: "right" });
  doc.text("Urlaub (U)", 130, y, { align: "right" });
  doc.text("Stunden", 160, y, { align: "right" });
  doc.text("Vergütung", 195, y, { align: "right" });
  y += 2;
  doc.line(15, y, 195, y);
  y += 6;
  doc.setFontSize(9);
  let totalH = 0;
  let totalA = 0;
  for (const [name, v] of per) {
    totalH += v.hours;
    totalA += v.amount;
    doc.text(`${name}${v.personnel ? ` (${v.personnel})` : ""}`.slice(0, 44), 15, y);
    doc.text(`${v.sick}`, 100, y, { align: "right" });
    doc.text(`${v.vacation}`, 130, y, { align: "right" });
    doc.text(`${de(v.hours)} Std.`, 160, y, { align: "right" });
    doc.text(formatMoney(v.amount), 195, y, { align: "right" });
    y += 6;
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
  }
  y += 1;
  doc.line(15, y, 195, y);
  y += 6;
  doc.setFontSize(10);
  doc.text("Gesamt", 15, y);
  doc.text(`${de(totalH)} Std.`, 160, y, { align: "right" });
  doc.text(formatMoney(totalA), 195, y, { align: "right" });

  y += 12;
  doc.setFontSize(11);
  doc.text("Einzelnachweis (A = Arbeit, K = Krank, U = Urlaub, F = Feiertag)", 15, y);
  y += 6;
  doc.setFontSize(8);
  for (const e of entries) {
    if (y > 282) {
      doc.addPage();
      y = 20;
    }
    const code = String(e["lohnart"] ?? "A");
    const time =
      e["start_time"] && e["end_time"]
        ? `${String(e["start_time"]).slice(0, 5)}–${String(e["end_time"]).slice(0, 5)}`
        : "-";
    doc.text(
      `${formatDate(String(e["work_date"] ?? ""))}  [${code}]  ${String(e["employee_name"] || "Ohne Zuordnung").slice(0, 26)}  ${time}  Pause ${num(e["break_minutes"])} Min.`,
      15,
      y,
    );
    const h =
      code === "A" && String(e["approval_status"] ?? "approved") === "approved"
        ? num(e["hours"])
        : 0;
    doc.text(code === "A" ? `${de(h)} Std.` : "-", 150, y, { align: "right" });
    doc.text(formatMoney(h * num(e["hourly_rate"])), 195, y, { align: "right" });
    y += 5;
  }

  download(filename, doc.output("blob"));
}

export function openPicker(input: HTMLInputElement) {
  const el = input as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    /* Browser ohne showPicker: natives Verhalten genügt. */
  }
}
