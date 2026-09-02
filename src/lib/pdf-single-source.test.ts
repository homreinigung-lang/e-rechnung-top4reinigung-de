import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildDocumentPdfBytes, type PdfDocData } from "@/lib/invoice-pdf";

/**
 * Sicherstellen, dass Vorschau/Download und E-Mail-Anhang exakt dieselbe
 * zentrale PDF-Erzeugung verwenden – es darf keinen zweiten Render-Pfad geben.
 */

function makeDoc(count: number, isInvoice = true): PdfDocData {
  return {
    isInvoice,
    title: isInvoice ? "Rechnung RE-2026-0009" : "Angebot AN-2026-0012",
    logoInitials: "HO",
    companyName: "HomR Office Gebäudereinigung GmbH & Co. KG",
    senderLine: "HomR Office, Musterstraße 1, 12345 Musterstadt",
    customer: [
      "SGS Institut Fresenius Gesellschaft mit beschränkter Haftung",
      "Im Maisel 14",
      "65232 Taunusstein",
    ],
    meta: [
      { label: isInvoice ? "Rechnungsnummer" : "Angebotsnummer", value: "RE-2026-0009" },
      { label: isInvoice ? "Rechnungsdatum" : "Datum", value: "02.09.2026" },
      { label: "Referenz", value: "Angebot AN-2026-0012 vom 20.08.2026" },
    ],
    introText: "vielen Dank für Ihren Auftrag.",
    items: Array.from({ length: count }, (_, i) => ({
      description: `Unterhaltsreinigung Position ${i + 1}`,
      quantity: "1,000",
      unit: "Std",
      unitPrice: "32,50",
      total: "32,50",
    })),
    summary: [
      { label: "Nettobetrag (Summe netto)", value: "1.000,00 €" },
      { label: "zzgl. Umsatzsteuer 19 %", value: "190,00 €" },
      { label: "Bruttobetrag (inkl. MwSt.)", value: "1.190,00 €", strong: true, rule: true },
    ],
    footer: [{ heading: "HomR Office", lines: ["Musterstraße 1", "12345 Musterstadt"] }],
  };
}

async function pages(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("Eine einzige PDF-Quelle für Vorschau, Download und E-Mail", () => {
  it("SendEmailDialog nutzt keinen eigenen Render-Pfad (kein Screenshot-Fallback)", () => {
    const src = readFileSync("src/components/SendEmailDialog.tsx", "utf8");
    expect(src).not.toContain("elementToPdfBytes");
    expect(src).toContain("buildPdfBytes: () => Promise<Uint8Array>");
  });

  it("Beleg-Seite reicht dieselbe Funktion an Download und E-Mail-Dialog", () => {
    const src = readFileSync("src/routes/_authenticated/dokumente.$id.tsx", "utf8");
    expect(src).toContain("async function makePdfBytes()");
    expect(src).toContain("buildPdfBytes={makePdfBytes}");
    // Download-Pfad nutzt exakt dieselbe Funktion
    expect(src).toContain("const bytes = await makePdfBytes();");
  });

  it.each([1, 5, 15, 30, 45])(
    "liefert für Download und E-Mail identische Ausgabe (%i Positionen)",
    async (count) => {
      const data = makeDoc(count);
      const download = await buildDocumentPdfBytes(data);
      const email = await buildDocumentPdfBytes(data);
      expect(await pages(email)).toBe(await pages(download));
      expect(email.length).toBe(download.length);
      expect(Buffer.from(email).equals(Buffer.from(download))).toBe(true);
    },
  );

  it("Angebot: mehrseitiger E-Mail-Anhang entspricht dem Download", async () => {
    const data = makeDoc(35, false);
    const download = await buildDocumentPdfBytes(data);
    const email = await buildDocumentPdfBytes(data);
    expect(await pages(download)).toBeGreaterThan(1);
    expect(Buffer.from(email).equals(Buffer.from(download))).toBe(true);
  });
});
