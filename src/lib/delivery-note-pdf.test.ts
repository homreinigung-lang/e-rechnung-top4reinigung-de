import { it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFRawStream, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";
import { buildDocumentPdfBytes, type PdfDocData } from "./invoice-pdf";
import { blankDeliveryNote, type DeliverySignature } from "./delivery-note";
import { readDeliveryNoteVersion } from "./delivery-note-pdf";

const invoice: PdfDocData = {
  isInvoice: true,
  title: "Rechnung RE-2026-001",
  logoInitials: "HR",
  companyName: "Hom Reinigung Service",
  ownerName: "Abdalrazak Aljomaa",
  contactEmail: "info@top4reinigung.de",
  contactPhone: "0162 3583882",
  senderLine: "Hom Reinigung Service | Poststraße 8, 66333 Völklingen",
  customer: ["SGS Industrial Services GmbH", "c/o Saarstahl AG"],
  meta: [{ label: "Rechnungsnummer", value: "RE-2026-001" }],
  items: Array.from({ length: 40 }, (_, i) => ({
    description: `Reinigung ${i + 1}`,
    quantity: "2",
    unit: "Std.",
    unitPrice: "32,00 €",
    total: "64,00 €",
  })),
  summary: [{ label: "Gesamt", value: "2.560,00 €" }],
  footer: [{ heading: "Firma", lines: ["Poststraße 8", "66333 Völklingen"] }],
};
const note = blankDeliveryNote(
  "abc",
  "2026-10-30",
  "20012640",
  "Gaswerkstraße (Torhaus 11), 66333 Völklingen",
);
note.rows[0] = {
  date: "2026-10-01",
  toiletPaper: "2",
  handTowels: "3",
  soap: "1,5",
  signature: null,
};

async function invoicePageContents(bytes: Uint8Array, count: number) {
  const pdf = await PDFDocument.load(bytes);
  return pdf
    .getPages()
    .slice(0, count)
    .map((page) => {
      const content = page.node.Contents();
      const streams =
        content instanceof PDFArray
          ? content.asArray().map((ref) => pdf.context.lookup(ref) as PDFRawStream)
          : [content as PDFRawStream];
      return { size: page.getSize(), contents: streams.map((s) => Array.from(s.getContents())) };
    });
}

it("appends the monthly note AFTER all original pages without changing ANY invoice page stream or size", async () => {
  const before = await buildDocumentPdfBytes(invoice);
  const originalPages = (await PDFDocument.load(before)).getPageCount();
  expect(originalPages).toBeGreaterThan(1);
  const after = await buildDocumentPdfBytes({ ...invoice, deliveryNote: { data: note } });
  const combined = await PDFDocument.load(after);
  expect(combined.getPageCount()).toBe(originalPages + 1);
  expect(await invoicePageContents(after, originalPages)).toEqual(
    await invoicePageContents(before, originalPages),
  );
  expect(combined.getPages().at(-1)!.getWidth()).toBeCloseTo(841.89);
});

it("appends every page of a scanned paper note in order", async () => {
  const scan = await PDFDocument.create();
  const font = await scan.embedFont(StandardFonts.Helvetica);
  scan.addPage([400, 600]).drawText("Papier 1", { font });
  scan.addPage([600, 400]).drawText("Papier 2", { font });
  const before = await buildDocumentPdfBytes(invoice);
  const count = (await PDFDocument.load(before)).getPageCount();
  const after = await buildDocumentPdfBytes({
    ...invoice,
    deliveryNote: { data: note, scan: await scan.save() },
  });
  const pdf = await PDFDocument.load(after);
  expect(pdf.getPageCount()).toBe(count + 2);
  expect(
    pdf
      .getPages()
      .slice(-2)
      .map((p) => p.getSize()),
  ).toEqual([
    { width: 400, height: 600 },
    { width: 600, height: 400 },
  ]);
  expect(await invoicePageContents(after, count)).toEqual(await invoicePageContents(before, count));
});

it("identifies the exact saved note version in a combined package without adding visible invoice text", async () => {
  const plain = await buildDocumentPdfBytes(invoice);
  const combined = await buildDocumentPdfBytes({
    ...invoice,
    deliveryNote: { data: note, version: 7 },
  });
  expect(await readDeliveryNoteVersion(plain)).toBe(0);
  expect(await readDeliveryNoteVersion(combined)).toBe(7);
});

it("renders names, dates and transparent signatures in the monthly template", async () => {
  const signature: DeliverySignature = {
    name: "Max Muster",
    signedAt: "2026-10-30T12:00:00.000Z",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=",
  };
  const signed = {
    ...note,
    supplierSignature: signature,
    customerSignature: signature,
    rows: note.rows.map((r, i) => (i === 0 ? { ...r, signature } : r)),
  };
  const bytes = await buildDocumentPdfBytes({ ...invoice, deliveryNote: { data: signed } });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  if (process.env["DELIVERY_NOTE_QA_PDF"])
    writeFileSync(process.env["DELIVERY_NOTE_QA_PDF"], bytes);
});

it("does not append delivery notes to quotes", async () => {
  const plain = await buildDocumentPdfBytes({ ...invoice, isInvoice: false });
  const withNote = await buildDocumentPdfBytes({
    ...invoice,
    isInvoice: false,
    deliveryNote: { data: note },
  });
  const count = (await PDFDocument.load(plain)).getPageCount();
  expect((await PDFDocument.load(withNote)).getPageCount()).toBe(count);
  expect(await invoicePageContents(withNote, count)).toEqual(
    await invoicePageContents(plain, count),
  );
});
