// Opt in with RECEIPT_OCR_LIVE=1 and GEMINI_API_KEY. Uses synthetic documents only.
// Calls Gemini directly, never the authenticated application or company AI quota.
import { expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractReceipt } from "./receipt-scan.server";
import { extractReceiptBaseline } from "../../scripts/fixtures/receipt-extract-baseline";

vi.mock("@tanstack/react-start/server-only", () => ({}));

it.skipIf(process.env["RECEIPT_OCR_LIVE"] !== "1")(
  "compares live Gemini latency and exact fields on synthetic invoices",
  async () => {
    if (!process.env["GEMINI_API_KEY"])
      throw new Error("GEMINI_API_KEY is required for the opt-in live evaluation");
    const results = [];
    for (const [index, date] of ["21.10.2026", "06.02.2026", "22.06.2026"].entries()) {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage([595, 842]);
      for (const [i, text] of [
        "TESTDOKUMENT - KEINE ECHTE RECHNUNG",
        "Musterlieferant GmbH",
        `Rechnungsnummer: 00026-${index}/OI`,
        `Rechnungsdatum: ${date}`,
        "Bestelldatum: 01.01.2022",
        "Zahlbar bis: 30.11.2026",
        "Nettosumme: 1.000,00 EUR",
        "Umsatzsteuer 19%: 190,00 EUR",
        "Rechnungsbetrag: 1.190,00 EUR",
      ].entries()) {
        page.drawText(text, { x: 48, y: 780 - i * 55, size: 14, font });
      }
      const dataUrl = `data:application/pdf;base64,${Buffer.from(await pdf.save()).toString("base64")}`;
      const measured: Record<string, unknown> = { fixture: index + 1 };
      // Alternate order; this is a small paired smoke evaluation, not a statistical corpus.
      for (const [name, extract] of index % 2
        ? ([
            ["after", extractReceipt],
            ["before", extractReceiptBaseline],
          ] as const)
        : ([
            ["before", extractReceiptBaseline],
            ["after", extractReceipt],
          ] as const)) {
        const start = performance.now();
        const result = await extract(dataUrl, "application/pdf");
        measured[name] = {
          elapsedMs: Math.round(performance.now() - start),
          date: result.expense_date,
          documentNumber: result.document_number,
          net: result.net_amount,
          vat: result.vat_amount,
          gross: result.gross_amount,
        };
        if (name === "after")
          expect(result).toMatchObject({
            expense_date: date.split(".").reverse().join("-"),
            document_number: `00026-${index}/OI`,
            net_amount: 1000,
            vat_amount: 190,
            gross_amount: 1190,
          });
      }
      results.push(measured);
    }
    console.info("Synthetic live OCR comparison:", JSON.stringify(results));
  },
  180_000,
);
