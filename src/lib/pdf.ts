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

  // Immer exakt eine Seite: bei Überlänge wird proportional herunterskaliert.
  let width = pageWidth;
  let height = (canvas.height * pageWidth) / canvas.width;
  if (height > pageHeight) {
    const ratio = pageHeight / height;
    height = pageHeight;
    width = pageWidth * ratio;
  }
  const x = (pageWidth - width) / 2;
  pdf.addImage(image, "JPEG", x, 0, width, height);
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
