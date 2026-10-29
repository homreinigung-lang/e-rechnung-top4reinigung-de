import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { buildDocumentPdfBytes, type PdfDocData } from "./invoice-pdf";
import { formatMoney, taxNoteForTaxMode, vatRateForTaxMode } from "./format";
import { computeDocumentTotals } from "./document-totals";
import { buildXRechnungXml, buildZugferdXml, embedZugferdXml } from "./erechnung";

it.each([
  ["domestic", true, 1],
  ["domestic_reverse_charge", true, 1],
  ["eu_reverse_charge", true, 1],
  ["kleinunternehmer", true, 1],
  ["domestic_reverse_charge", false, 1],
  ["domestic_reverse_charge", true, 35],
  ["domestic_reverse_charge", true, 2], // Header discount.
  ["domestic_reverse_charge", true, -1], // Signed storno data.
  ["eu_reverse_charge", true, -1],
  ["kleinunternehmer", true, -1],
  ["domestic", true, -1],
] as const)(
  "renders synthetic %s invoice=%s rows=%s with the existing renderer",
  async (mode, isInvoice, count) => {
    const isStorno = count < 0;
    const items = Array.from({ length: Math.abs(count) }, (_, i) => ({
      position: i + 1,
      description: `Gebäudereinigung - synthetische Testposition ${i + 1}`,
      quantity: 4,
      unit: "Std",
      unit_price: isStorno ? -250 : 250,
    }));
    const vatRate = vatRateForTaxMode(mode);
    const totals = computeDocumentTotals(items, count === 2 ? 10 : 0, vatRate);
    const number = isStorno ? "ST-TEST-2026" : isInvoice ? "RE-TEST-2026" : "AN-TEST-2026";
    const input = {
      doc: {
        tax_mode: mode,
        is_storno: isStorno,
        issue_date: "2026-10-29",
        due_date: "2026-11-12",
        customer_company: "Testkunde Gebäudereinigung GmbH",
        customer_address_line: "Testweg 2",
        customer_postal_code: "66111",
        customer_city: "Saarbrücken",
        customer_country: mode === "eu_reverse_charge" ? "Österreich" : "Deutschland",
        customer_vat_id: mode === "eu_reverse_charge" ? "ATU12345678" : "DE123456789",
        customer_email: "buyer@example.invalid",
      },
      settings: {
        company_name: "GebCalc TEST - keine echte Rechnung",
        address_line: "Musterweg 1",
        postal_code: "66111",
        city: "Saarbrücken",
        vat_id: "DE987654321",
        email: "seller@example.invalid",
        phone: "+496810000",
        owner_name: "Testfirma",
      },
      number,
      items,
      vatRate,
      ...totals,
    };
    const data: PdfDocData = {
      isInvoice,
      title: `${isInvoice ? "Rechnung" : "Angebot"} ${number}`,
      logoInitials: "TT",
      companyName: input.settings.company_name,
      senderLine: "Testfirma, Musterweg 1, 66111 Saarbrücken",
      customer: [input.doc.customer_company, "Testweg 2", "66111 Saarbrücken"],
      meta: [
        { label: "Belegnummer", value: number },
        { label: "Datum", value: "29.10.2026" },
      ],
      introText: "Synthetischer Prüfbeleg. Keine Zahlungsforderung.",
      items: items.map((i) => ({
        description: i.description,
        quantity: "4,000",
        unit: i.unit,
        unitPrice: isStorno ? "-250,00" : "250,00",
        total: isStorno ? "-1.000,00" : "1.000,00",
      })),
      summary: [
        ...(count === 2 ? [{ label: "Rabatt 10 %", value: formatMoney(-totals.discountAmount) }] : []),
        { label: "Nettobetrag", value: formatMoney(totals.netTotal) },
        { label: `Umsatzsteuer ${vatRate} %`, value: formatMoney(totals.vatAmount) },
        { label: "Gesamtbetrag", value: formatMoney(totals.grossTotal), strong: true, rule: true },
      ],
      taxNote: taxNoteForTaxMode(mode),
      footer: [
        { heading: "Testfirma", lines: ["Nur synthetische Daten", "seller@example.invalid"] },
      ],
    };
    const pdf = await buildDocumentPdfBytes(data);
    const pageCount = (await PDFDocument.load(pdf)).getPageCount();
    expect(pageCount).toBeGreaterThanOrEqual(1);
    if (Math.abs(count) <= 2) expect(pageCount).toBe(1);
    else expect(pageCount).toBeGreaterThan(1);
    const xml = buildZugferdXml(input);
    const hybrid = await embedZugferdXml(pdf, xml, { number, title: "Testrechnung" });
    const embedded = await PDFDocument.load(hybrid);
    const original = await PDFDocument.load(pdf);
    expect(embedded.getPageCount()).toBe(pageCount);
    expect(embedded.catalog.has(PDFName.of("OutputIntents"))).toBe(true);
    expect(embedded.context.trailerInfo.ID).toBeDefined();
    const metadata = embedded.context.lookup(embedded.catalog.get(PDFName.of("Metadata")));
    if (!(metadata instanceof PDFRawStream)) throw new Error("Missing XMP stream");
    const xmp = new TextDecoder("utf-8", { fatal: true }).decode(metadata.getContents());
    expect(xmp).toContain('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"');
    expect(xmp).toContain("hybride E-Rechnung");
    for (const [, object] of embedded.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Font")) {
        const descriptor = object.lookup(PDFName.of("FontDescriptor"), PDFDict);
        expect(descriptor.has(PDFName.of("FontFile2"))).toBe(true);
      }
    }
    for (let page = 0; page < pageCount; page++) {
      const contents = (doc: PDFDocument) => {
        const streams = doc.getPage(page).node.Contents() as PDFArray;
        return streams
          .asArray()
          .map((ref) => Array.from((doc.context.lookup(ref) as PDFRawStream).getContents()));
      };
      expect(contents(embedded)).toEqual(contents(original));
    }
    const out = process.env["GEBCALC_REVIEW_OUTPUT"];
    if (out) {
      mkdirSync(out, { recursive: true });
      const name = `${mode}-${isInvoice ? "invoice" : "quote"}-${count}`;
      writeFileSync(join(out, `${name}.pdf`), pdf);
      if (isInvoice) {
        writeFileSync(join(out, `${name}-zugferd.pdf`), hybrid);
        writeFileSync(join(out, `${name}-xrechnung.xml`), buildXRechnungXml(input));
        writeFileSync(join(out, `${name}-zugferd.xml`), xml);
      }
    }
  },
);
