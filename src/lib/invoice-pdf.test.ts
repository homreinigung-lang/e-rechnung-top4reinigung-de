import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { addDays } from "@/lib/format";
import { buildDocumentPdfBytes, type PdfDocData } from "@/lib/invoice-pdf";

const LONG_DESC =
  "Fensterreinigung für das gesamte Gebäude inklusive Rahmen, Falze und Fensterbänke, " +
  "Innen- und Außenreinigung aller Glasflächen sowie Entfernung von Bauschmutz und " +
  "Klebeetiketten nach Abschluss der Sanierungsarbeiten im gesamten Objekt.";

function makeDoc(count: number, longText = false): PdfDocData {
  const items = Array.from({ length: count }, (_, i) => ({
    description: longText ? `${i + 1}. ${LONG_DESC}` : `Unterhaltsreinigung Position ${i + 1}`,
    quantity: "1,000",
    unit: "Std",
    unitPrice: "32,50",
    total: "32,50",
  }));
  return {
    isInvoice: true,
    title: "Rechnung RE-2026-0001",
    logoInitials: "HO",
    companyName: "HomR Office Gebäudereinigung GmbH & Co. KG",
    senderLine: "HomR Office, Musterstraße 1, 12345 Musterstadt",
    customer: [
      "SGS Institut Fresenius Gesellschaft mit beschränkter Haftung",
      "Im Maisel 14",
      "65232 Taunusstein",
    ],
    meta: [
      { label: "Rechnungsnummer", value: "RE-2026-0001" },
      { label: "Rechnungsdatum", value: "02.09.2026" },
      { label: "Fällig am", value: "16.09.2026" },
      { label: "Angebot", value: "AN-2026-0004 vom 20.08.2026" },
    ],
    introText: "vielen Dank für Ihren Auftrag. Wir stellen Ihnen folgende Leistungen in Rechnung:",
    items,
    summary: [
      { label: "Nettobetrag (Summe netto)", value: "1.000,00 €" },
      { label: "zzgl. Umsatzsteuer 19 %", value: "190,00 €" },
      { label: "Bruttobetrag (inkl. MwSt.)", value: "1.190,00 €", strong: true, rule: true },
    ],
    footer: [
      { heading: "HomR Office", lines: ["Musterstraße 1", "12345 Musterstadt"] },
      { heading: "Kontakt", lines: ["info@example.de", "+49 123 456789"] },
      { heading: "Bank", lines: ["IBAN DE00 0000 0000 0000", "BIC XXXXDEFF"] },
    ],
  };
}

async function pageCount(data: PdfDocData): Promise<number> {
  const bytes = await buildDocumentPdfBytes(data);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
}

describe("Rechnungs-PDF (pdf-lib)", () => {
  it("erzeugt ein gültiges PDF mit einer Position", async () => {
    expect(await pageCount(makeDoc(1))).toBe(1);
  });

  it("hält kurze Belege einseitig", async () => {
    expect(await pageCount(makeDoc(5))).toBe(1);
  });

  it("bricht lange Positionslisten auf mehrere Seiten um – ohne Leerseiten", async () => {
    const p15 = await pageCount(makeDoc(15));
    const p30 = await pageCount(makeDoc(30));
    const p60 = await pageCount(makeDoc(60));
    expect(p15).toBeGreaterThanOrEqual(1);
    expect(p30).toBeGreaterThan(1);
    expect(p60).toBeGreaterThan(p30);
    // Grobe Plausibilität: keine überzähligen (leeren) Seiten.
    expect(p60).toBeLessThanOrEqual(Math.ceil(60 / 20) + 2);
  });

  it("umbricht sehr lange Leistungsbeschreibungen", async () => {
    const pages = await pageCount(makeDoc(15, true));
    expect(pages).toBeGreaterThan(1);
  });

  it("erzeugt auch mit Storno-Stempel ein gültiges PDF", async () => {
    const doc = makeDoc(30);
    const pages = await pageCount({
      ...doc,
      watermark: "STORNO",
      watermarkNote: "Storniert durch RE-2026-0007",
    });
    expect(pages).toBeGreaterThan(1);
  });
});

describe("Zahlungsziel", () => {
  it("berechnet das Fälligkeitsdatum aus Rechnungsdatum + Zahlungsziel", () => {
    expect(addDays("2026-09-02", 14)).toBe("2026-09-16");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("Netto + MwSt. ergibt Brutto", () => {
    const net = 1000;
    const vat = Math.round(net * 0.19 * 100) / 100;
    expect(net + vat).toBe(1190);
  });
});
