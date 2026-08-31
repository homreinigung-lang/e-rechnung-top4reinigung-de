import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  PLATFORM_PAYMENT_FALLBACK,
  formatIban,
  type PlatformPayment,
} from "@/lib/platform-payment";
import { euro } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { cleanPdfText } from "@/lib/pdf-text";

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const M = 20 * MM;

export type PlatformInvoiceData = {
  /** Fortlaufende Rechnungsnummer, z. B. RE-2026-0001. */
  number: string;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  customerCompany: string;
  customerAddressLine: string;
  customerPostalCode: string;
  customerCity: string;
  planName: string;
  intervalLabel: string;
  netCents: number;
  vatCents: number;
  grossCents: number;
  payment?: PlatformPayment;
};

/**
 * Offizielle Rechnung des Plattform-Betreibers an einen Abo-Kunden
 * (Pflichtangaben nach § 14 UStG), Layout analog zur bestehenden PDF-Erzeugung.
 */
export async function buildPlatformInvoicePdfBytes(d: PlatformInvoiceData): Promise<Uint8Array> {
  const p = d.payment ?? PLATFORM_PAYMENT_FALLBACK;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = rgb(0.067, 0.094, 0.153);
  const muted = rgb(0.42, 0.45, 0.5);

  let y = PAGE_H - M;
  const line = (
    s: string,
    opts?: { size?: number; bold?: boolean; color?: typeof text; gap?: number },
  ) => {
    const size = opts?.size ?? 10;
    page.drawText(cleanPdfText(s), {
      x: M,
      y,
      size,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? text,
    });
    y -= size + (opts?.gap ?? 4);
  };
  const right = (label: string, value: string, strong = false) => {
    const size = 10;
    const v = cleanPdfText(value);
    page.drawText(cleanPdfText(label), { x: M, y, size, font, color: muted });
    const w = (strong ? bold : font).widthOfTextAtSize(v, size);
    page.drawText(v, { x: PAGE_W - M - w, y, size, font: strong ? bold : font, color: text });
    y -= size + 6;
  };

  // Rechnungssteller
  line(p.recipient, { size: 14, bold: true, gap: 4 });
  const issuerAddress = [p.address_line, [p.postal_code, p.city].filter(Boolean).join(" ")].filter(
    (v) => v.trim() !== "",
  );
  for (const l of issuerAddress) line(l, { size: 9, color: muted, gap: 2 });
  if (p.vat_id.trim()) line(`USt-IdNr.: ${p.vat_id}`, { size: 9, color: muted, gap: 2 });
  if (p.email.trim()) line(p.email, { size: 9, color: muted, gap: 2 });
  y -= 10;

  line("Rechnung", { size: 16, bold: true, gap: 14 });

  line("Rechnungsempfänger", { size: 9, color: muted, gap: 2 });
  line(d.customerCompany || "Ohne Namen", { bold: true });
  if (d.customerAddressLine.trim()) line(d.customerAddressLine);
  const cityLine = [d.customerPostalCode, d.customerCity].filter(Boolean).join(" ").trim();
  if (cityLine) line(cityLine);
  y -= 8;

  right("Rechnungsnummer", d.number, true);
  right("Rechnungsdatum", formatDate(d.issueDate));
  right("Leistungszeitraum", `${formatDate(d.periodStart)} – ${formatDate(d.periodEnd)}`);
  y -= 8;

  line(`Leistung: ${d.planName} (${d.intervalLabel})`, { gap: 4 });
  line("Softwarenutzung / Abonnement Rechnungs- und Verwaltungssystem", {
    size: 9,
    color: muted,
    gap: 10,
  });

  right("Nettobetrag", euro(d.netCents));
  right(d.vatCents > 0 ? "zzgl. 19 % Umsatzsteuer" : "Umsatzsteuer", euro(d.vatCents));
  right("Rechnungsbetrag (brutto)", euro(d.grossCents), true);
  y -= 10;

  line("Zahlungsdetails (SEPA-Überweisung)", { bold: true, gap: 6 });
  line(`Empfänger: ${p.recipient}`);
  line(`IBAN: ${formatIban(p.iban)}`);
  line(`BIC: ${p.bic}`);
  line(`Bank: ${p.bank}`);
  line(`Verwendungszweck: ${d.number}`, { gap: 10 });
  line(p.terms, { size: 9, color: muted, gap: 4 });

  return pdf.save();
}
