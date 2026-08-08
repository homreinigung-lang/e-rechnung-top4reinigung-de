import { PDFDocument } from "pdf-lib";

/** Erzeugt aus dem Druckbereich der Rechnung ein A4-PDF (als Bytes). */
export async function elementToPdfBytes(element: HTMLElement): Promise<Uint8Array> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  // html2canvas versteht keine oklch()-Farben (Tailwind v4) – im Klon auf
  // klassische Farbwerte umstellen, damit die Erzeugung nicht abbricht.
  // Für ein sauberes A4-Layout die Breite während der Aufnahme auf
  // A4 (794 px @96dpi) fixieren – sonst quetschen sich die Tabellenspalten
  // auf schmalen Bildschirmen ineinander.
  const previousStyle = element.getAttribute("style") ?? "";
  element.style.width = "794px";
  element.style.maxWidth = "794px";

  const canvas = await html2canvas(element, {
    scale: 2,
    windowWidth: 1024,
    useCORS: true,
    allowTaint: false,
    imageTimeout: 15000,
    backgroundColor: "#ffffff",
    onclone: (doc) => {
      const style = doc.createElement("style");
      style.textContent = `*{color:#111827 !important;background-color:transparent !important;border-color:#d1d5db !important;box-shadow:none !important;}
      body,.paper{background-color:#ffffff !important;}
      .text-muted-foreground{color:#6b7280 !important;}
      thead tr{background-color:#f3f4f6 !important;}
      .print-area{padding:14mm 15mm !important;box-shadow:none !important;border:none !important;}
      .invoice-table{table-layout:fixed !important;width:100% !important;border-collapse:collapse !important;border:1px solid #9ca3af !important;}
      .invoice-table th,.invoice-table td{vertical-align:top !important;overflow-wrap:break-word !important;word-break:normal !important;letter-spacing:normal !important;border:1px solid #9ca3af !important;padding:5px 7px !important;}
      .invoice-table thead th{background-color:#f3f4f6 !important;border-bottom:1.5px solid #6b7280 !important;}
      .invoice-table-wrap{overflow:visible !important;}
      .invoice-logo{max-height:50px !important;width:auto !important;object-fit:contain !important;display:block !important;}`;
      doc.head.appendChild(style);
    },
  });


  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const elementRect = element.getBoundingClientRect();
  const renderScale = canvas.width / elementRect.width;
  // Wie viele Canvas-Pixel passen auf eine A4-Seite?
  const pagePx = Math.floor((pageHeight * canvas.width) / pageWidth);

  // Blöcke, die niemals zerschnitten werden dürfen (Kopf, Zeilen, Summen, Fuß).
  const blocks: Array<{ top: number; bottom: number }> = [];
  element
    .querySelectorAll<HTMLElement>(
      "header, tr, td, th, .invoice-summary-block, .invoice-closing, .invoice-description, .invoice-description li, li, footer, p, h1, h2, h3",
    )

    .forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.height <= 0) return;
      blocks.push({
        top: (rect.top - elementRect.top) * renderScale,
        bottom: (rect.bottom - elementRect.top) * renderScale,
      });
    });

  // Tabellenkopf vermessen, damit er auf Folgeseiten wiederholt werden kann.
  const theadEl = element.querySelector<HTMLElement>(".invoice-table thead");
  const tableEl = element.querySelector<HTMLElement>(".invoice-table");
  let header: { top: number; bottom: number; tableBottom: number } | null = null;
  if (theadEl && tableEl) {
    const hr = theadEl.getBoundingClientRect();
    const tr = tableEl.getBoundingClientRect();
    if (hr.height > 0) {
      header = {
        top: (hr.top - elementRect.top) * renderScale,
        bottom: (hr.bottom - elementRect.top) * renderScale,
        tableBottom: (tr.bottom - elementRect.top) * renderScale,
      };
    }
  }

  // Breite erst nach dem Vermessen zurücksetzen.
  element.setAttribute("style", previousStyle);

  const headerHeight = header ? Math.round(header.bottom - header.top) : 0;

  // Kopfzeilen-Ausschnitt einmalig als eigenes Canvas vorbereiten.
  let headerCanvas: HTMLCanvasElement | null = null;
  if (header && headerHeight > 0) {
    headerCanvas = document.createElement("canvas");
    headerCanvas.width = canvas.width;
    headerCanvas.height = headerHeight;
    const hctx = headerCanvas.getContext("2d");
    if (hctx) {
      hctx.fillStyle = "#ffffff";
      hctx.fillRect(0, 0, headerCanvas.width, headerCanvas.height);
      hctx.drawImage(
        canvas,
        0,
        Math.round(header.top),
        canvas.width,
        headerHeight,
        0,
        0,
        canvas.width,
        headerHeight,
      );
    } else {
      headerCanvas = null;
    }
  }

  const nextBreak = (start: number, available: number) => {
    const limit = Math.min(canvas.height, start + available);
    if (limit >= canvas.height) return canvas.height;
    let cut = limit;
    for (const b of blocks) {
      // Block kreuzt die Seitengrenze -> Umbruch davor setzen.
      if (b.top > start && b.top < limit && b.bottom > limit) {
        cut = Math.min(cut, b.top);
      }
    }
    // Falls ein einzelner Block höher als eine Seite ist: hart schneiden.
    return cut <= start + 1 ? limit : cut;
  };

  const addSlice = (startY: number, endY: number, addPage: boolean, withHeader: boolean) => {
    const sliceHeight = Math.max(1, Math.round(endY - startY));
    const extra = withHeader && headerCanvas ? headerHeight : 0;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight + extra;
    const context = slice.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, slice.width, slice.height);
    if (extra && headerCanvas) context.drawImage(headerCanvas, 0, 0);
    context.drawImage(
      canvas,
      0,
      Math.round(startY),
      canvas.width,
      sliceHeight,
      0,
      extra,
      canvas.width,
      sliceHeight,
    );
    if (addPage) pdf.addPage();
    const renderedHeight = (slice.height * pageWidth) / canvas.width;
    pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageWidth, renderedHeight);
  };

  let cursor = 0;
  let first = true;
  while (cursor < canvas.height) {
    // Kopf wiederholen, solange die Seite noch Tabellenzeilen enthält.
    const repeatHeader =
      !first && !!header && cursor > header.bottom && cursor < header.tableBottom - 1;
    const available = pagePx - (repeatHeader ? headerHeight : 0);
    const end = nextBreak(cursor, available);
    addSlice(cursor, end, !first, repeatHeader);
    first = false;
    cursor = end;
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
