import { PDFDocument } from "pdf-lib";

/** Erzeugt aus dem Druckbereich der Rechnung ein A4-PDF (als Bytes). */
export async function elementToPdfBytes(element: HTMLElement): Promise<Uint8Array> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  // html2canvas versteht keine oklch()-Farben (Tailwind v4) – im Klon auf
  // klassische Farbwerte umstellen, damit die Erzeugung nicht abbricht.
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    onclone: (doc) => {
      const style = doc.createElement("style");
      style.textContent = `*{color:#111827 !important;background-color:transparent !important;border-color:#d1d5db !important;box-shadow:none !important;}
      body,.paper{background-color:#ffffff !important;}
      .text-muted-foreground{color:#6b7280 !important;}
      thead tr{background-color:#f3f4f6 !important;}
      td,th{border-color:#e5e7eb !important;}`;
      doc.head.appendChild(style);
    },
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const image = canvas.toDataURL("image/jpeg", 0.95);

  // Normale Schriftgröße beibehalten. Wenn der zusammengehörige Abschlussblock
  // die A4-Grenze kreuzt, wird er vollständig an den Anfang von Seite 2 gesetzt.
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  const summary = element.querySelector<HTMLElement>(".invoice-summary-block");
  const elementRect = element.getBoundingClientRect();
  const summaryRect = summary?.getBoundingClientRect();
  const renderScale = canvas.width / elementRect.width;
  const summaryTopPx = summaryRect
    ? Math.round((summaryRect.top - elementRect.top) * renderScale)
    : 0;
  const summaryHeightPx = summaryRect ? Math.ceil(summaryRect.height * renderScale) : 0;

  // Das Dokument ist bewusst als 2-Seiten-Layout aufgebaut: Seite 1 = Kopf +
  // Positionstabelle, Seite 2 = Summen, Reverse-Charge, Zahlung, Bank, QR-Code.
  const splitAtSummary = summaryTopPx > 0 && summaryHeightPx > 0;

  if (splitAtSummary) {
    const addSlice = (startY: number, endY: number, addPage: boolean) => {
      const sliceHeight = Math.max(1, endY - startY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        startY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight,
      );
      if (addPage) pdf.addPage();
      const renderedHeight = (sliceHeight * pageWidth) / canvas.width;
      pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageWidth, renderedHeight);
    };

    addSlice(0, summaryTopPx, false);
    addSlice(summaryTopPx, canvas.height, true);
    return new Uint8Array(pdf.output("arraybuffer"));
  }

  // Allgemeiner Fallback für längere Dokumente.
  let remaining = imgHeight;
  let offset = 0;
  pdf.addImage(image, "JPEG", 0, 0, pageWidth, imgHeight);
  remaining -= pageHeight;
  while (remaining > 0) {
    offset -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, "JPEG", 0, offset, pageWidth, imgHeight);
    remaining -= pageHeight;
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}


/** Fügt zwei PDF-Dateien zu einer einzigen zusammen (z. B. Rechnung + Stundennachweis). */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
