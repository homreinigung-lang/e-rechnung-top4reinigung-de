import { jsPDF } from "jspdf";

type TripRow = Record<string, string>;

/** Fahrtenbuch-only PDF: a paginated, wrapped table; invoice and quote PDFs are independent. */
export function buildAccountantFahrtenbuchPdf(rows: TripRow[], from: string, to: string): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 11;
  const widths = [23, 23, 30, 26, 30, 35, 45, 26];
  const headers = ["Datum", "Zeit", "Fahrzeug", "Kennzeichen", "Fahrtart", "Von", "Ziel / Zweck", "km"];
  const tableWidth = widths.reduce((sum, w) => sum + w, 0);
  const bottom = pageHeight - 16;
  const lineHeight = 4;
  let y = 0;
  let page = 0;

  const tableHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setDrawColor(185, 197, 209);
    let x = left;
    headers.forEach((header, index) => {
      // jsPDF can change its active non-stroking color while writing text.
      // Reset the background before EVERY cell, not only once per row.
      doc.setFillColor(227, 235, 243);
      doc.rect(x, y, widths[index]!, 9, "FD");
      doc.setTextColor(30, 40, 52);
      doc.text(header, x + 2, y + 6);
      x += widths[index]!;
    });
    y += 9;
  };

  const newPage = () => {
    if (page > 0) doc.addPage();
    page++;
    y = 13;
    doc.setTextColor(30, 40, 52);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Fahrtenbuch", left, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${from} - ${to}`, left + tableWidth, y, { align: "right" });
    y += 7;
    tableHeader();
  };

  const wrap = (text: string, width: number): string[] => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    return doc.splitTextToSize(text || "-", width - 4) as string[];
  };

  const detail = (label: string, value: string, shade: boolean) => {
    const text = `${label}: ${value || "-"}`;
    const lines = wrap(text, tableWidth);
    // A very long note can continue on the following page, without clipping.
    for (let start = 0; start < lines.length;) {
      if (y + 5 > bottom) newPage();
      const capacity = Math.max(1, Math.floor((bottom - y - 2) / lineHeight));
      const part = lines.slice(start, start + capacity);
      const height = Math.max(5, part.length * lineHeight + 2);
      if (shade) { doc.setFillColor(248, 250, 252); doc.rect(left, y, tableWidth, height, "F"); }
      doc.setDrawColor(207, 216, 225);
      doc.rect(left, y, tableWidth, height);
      doc.setTextColor(30, 40, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(part, left + 2, y + 4);
      y += height;
      start += part.length;
    }
  };

  newPage();
  if (!rows.length) {
    doc.setFontSize(10);
    doc.text("Keine Fahrten im gewaehlten Zeitraum.", left + 2, y + 8);
  }

  rows.forEach((row, index) => {
    const value = (key: string) => row[key]?.trim() || "-";
    const values = [
      value("Datum"),
      `${value("Startzeit")} - ${value("Rückkehrzeit")}`,
      value("Fahrzeug"),
      value("Kennzeichen"),
      value("Fahrtart"),
      value("Von"),
      value("Kunde / Ziel / Zweck"),
      value("Geschäftliche km"),
    ];
    const wrapped = values.map((v, i) => wrap(v, widths[i]!));
    const height = Math.max(9, Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + 4);
    if (y + height + 5 > bottom) newPage();
    doc.setDrawColor(207, 216, 225);
    let x = left;
    wrapped.forEach((lines, i) => {
      // Text rendering changes jsPDF's active fill; restore it for each cell.
      if (index % 2 === 0) doc.setFillColor(255, 255, 255);
      else doc.setFillColor(246, 249, 252);
      doc.rect(x, y, widths[i]!, height, "FD");
      doc.setTextColor(30, 40, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(lines, x + 2, y + 4.5);
      x += widths[i]!;
    });
    y += height;
    detail("Zieladresse", value("Zieladresse"), true);
    detail("Kilometerstand", `Start: ${value("Start-km")} | Ende: ${value("End-km")} | Geschaeftlich: ${value("Geschäftliche km")} km`, true);
    if (row["Bemerkung"]?.trim()) detail("Bemerkung", row["Bemerkung"], true);
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(190, 199, 209);
    doc.line(left, pageHeight - 12, left + tableWidth, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 98, 108);
    doc.text(`Seite ${p} / ${totalPages}`, left + tableWidth, pageHeight - 8, { align: "right" });
  }
  return doc.output("blob");
}
