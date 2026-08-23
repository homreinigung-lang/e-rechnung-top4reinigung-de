import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PAYMENT_DETAILS } from "@/lib/plan-orders";
import { euro } from "@/lib/admin";
import { formatDate } from "@/lib/format";

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const M = 20 * MM;

export type ProformaData = {
  /** Zahlungsaufforderung / Proforma-Nummer, dient auch als Verwendungszweck. */
  reference: string;
  companyName: string;
  addressLines?: string[];
  planName: string;
  intervalLabel: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

/** Einfache Proforma-Rechnung / Zahlungsaufforderung als PDF (pdf-lib). */
export async function buildProformaPdfBytes(d: ProformaData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = rgb(0.067, 0.094, 0.153);
  const muted = rgb(0.42, 0.45, 0.5);

  let y = PAGE_H - M;
  const line = (s: string, opts?: { size?: number; bold?: boolean; color?: typeof text; gap?: number }) => {
    const size = opts?.size ?? 10;
    page.drawText(s, { x: M, y, size, font: opts?.bold ? bold : font, color: opts?.color ?? text });
    y -= size + (opts?.gap ?? 4);
  };
  const right = (label: string, value: string, strong = false) => {
    const size = 10;
    page.drawText(label, { x: M, y, size, font, color: muted });
    const w = (strong ? bold : font).widthOfTextAtSize(value, size);
    page.drawText(value, {
      x: PAGE_W - M - w,
      y,
      size,
      font: strong ? bold : font,
      color: text,
    });
    y -= size + 6;
  };

  line(PAYMENT_DETAILS.recipient, { size: 14, bold: true, gap: 10 });
  line("Zahlungsaufforderung / Proforma-Rechnung", { size: 16, bold: true, gap: 14 });

  line("Rechnungsempfänger", { size: 9, color: muted, gap: 2 });
  line(d.companyName, { bold: true });
  for (const l of d.addressLines ?? []) line(l);
  y -= 8;

  right("Referenz / Verwendungszweck", d.reference, true);
  right("Datum", formatDate(new Date().toISOString().slice(0, 10)));
  y -= 8;

  line(`Leistung: ${d.planName} (${d.intervalLabel})`, { gap: 10 });

  right("Netto", euro(d.netCents));
  right(d.vatCents > 0 ? "zzgl. 19 % MwSt." : "Umsatzsteuer", euro(d.vatCents));
  right("Rechnungsbetrag", euro(d.grossCents), true);
  y -= 10;

  line("Zahlungsdetails (SEPA-Überweisung)", { bold: true, gap: 6 });
  line(`Empfänger: ${PAYMENT_DETAILS.recipient}`);
  line(`IBAN: ${PAYMENT_DETAILS.iban}`);
  line(`BIC: ${PAYMENT_DETAILS.bic}`);
  line(`Bank: ${PAYMENT_DETAILS.bank}`);
  line(`Verwendungszweck: ${d.reference}`, { gap: 10 });
  line(PAYMENT_DETAILS.terms, { size: 9, color: muted, gap: 4 });
  line(
    "Dies ist eine Zahlungsaufforderung (Proforma) und keine umsatzsteuerliche Rechnung.",
    { size: 9, color: muted },
  );

  return pdf.save();
}
