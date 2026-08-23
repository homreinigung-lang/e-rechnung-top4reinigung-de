import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cleanPdfText } from "@/lib/pdf-text";

const A4 = { w: 595.28, h: 841.89 };

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[äÄ]/g, "ae")
      .replace(/[öÖ]/g, "oe")
      .replace(/[üÜ]/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "Beleg"
  );
}

/**
 * Wandelt ein Beleg-Foto in ein A4-PDF um (Kopfzeile: Datum + Ausgabenart).
 * PDFs werden unverändert zurückgegeben.
 */
export async function receiptFileToPdf(
  file: File,
  meta: { date: string; category: string; supplier?: string },
): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) return file;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const image = file.type === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

  const [y, m, d] = meta.date.split("-");
  const dateLabel = y && m && d ? `${d}.${m}.${y}` : meta.date;
  const heading = `Beleg ${dateLabel} · ${meta.category || "Sonstiges"}`;

  page.drawText(cleanPdfText(heading), { x: 40, y: A4.h - 50, size: 13, font: bold });
  if (meta.supplier) {
    page.drawText(cleanPdfText(meta.supplier), {
      x: 40,
      y: A4.h - 68,
      size: 10,
      font,
      color: rgb(0.36, 0.4, 0.46),
    });
  }

  const maxW = A4.w - 80;
  const maxH = A4.h - 150;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (A4.w - w) / 2, y: A4.h - 100 - h, width: w, height: h });

  pdf.setTitle(heading);
  pdf.setProducer("GebCalc");

  const out = await pdf.save();
  const name = `${slug(dateLabel)}_${slug(meta.category || "Sonstiges")}.pdf`;
  return new File([out as BlobPart], name, { type: "application/pdf" });
}
