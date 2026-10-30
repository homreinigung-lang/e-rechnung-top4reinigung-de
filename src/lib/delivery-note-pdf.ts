import { PDFDocument, PDFName, PDFNumber, StandardFonts, rgb } from "pdf-lib";

const VERSION_KEY = PDFName.of("HOMDeliveryNoteVersion");
export function markDeliveryNoteVersion(pdf: PDFDocument, version: number) {
  pdf.catalog.set(VERSION_KEY, PDFNumber.of(version));
}
export async function readDeliveryNoteVersion(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  const value = pdf.catalog.lookupMaybe(VERSION_KEY, PDFNumber)?.asNumber() ?? 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Ungültige Lieferscheinversion.");
  return value;
}
import { clean, wrap, type PdfDocData } from "./invoice-pdf/shared";
import {
  deliveryTotals,
  deliveryNumber,
  MATERIALS,
  type DeliveryNote,
  type DeliverySignature,
} from "./delivery-note";

/** Only appends pages. The invoice renderer and its page contents stay unchanged. */
export async function appendDeliveryNote(
  pdf: PDFDocument,
  issuer: Pick<
    PdfDocData,
    "companyName" | "ownerName" | "contactEmail" | "contactPhone" | "footer" | "customer"
  >,
  note: DeliveryNote,
  scan?: Uint8Array,
) {
  if (scan) {
    const source = await PDFDocument.load(scan);
    if (source.getPageCount() === 0)
      throw new Error("Der gescannte Lieferschein enthält keine Seiten.");
    for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
    return;
  }
  const page = pdf.addPage([841.89, 595.28]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.13, 0.37, 0.64),
    muted = rgb(0.38, 0.42, 0.47),
    border = rgb(0.78, 0.82, 0.87);
  const text = (
    value: string,
    x: number,
    top: number,
    width: number,
    size = 9,
    strong = false,
    maxLines = 3,
  ) => {
    const font = strong ? bold : regular;
    const lines = wrap(font, size, clean(value), width);
    lines
      .slice(0, maxLines)
      .forEach((line, i) =>
        page.drawText(
          i === maxLines - 1 && lines.length > maxLines ? line.slice(0, -3) + "..." : line,
          { x, y: page.getHeight() - top - size - i * (size + 3), font, size, color: muted },
        ),
      );
  };
  const rect = (x: number, top: number, width: number, height: number, fill = false) =>
    page.drawRectangle({
      x,
      y: page.getHeight() - top - height,
      width,
      height,
      borderColor: border,
      borderWidth: 0.6,
      ...(fill ? { color: rgb(0.95, 0.97, 0.99) } : {}),
    });
  const line = (x: number, top: number, width: number) =>
    page.drawLine({
      start: { x, y: page.getHeight() - top },
      end: { x: x + width, y: page.getHeight() - top },
      color: border,
      thickness: 0.7,
    });
  const stamp = async (
    sig: DeliverySignature | null,
    x: number,
    top: number,
    width: number,
    height: number,
  ) => {
    if (!sig) {
      line(x + 6, top + height - 15, width - 12);
      return;
    }
    const image = await pdf.embedPng(sig.image);
    const size = image.scaleToFit(width - 14, height - 19);
    page.drawImage(image, {
      x: x + (width - size.width) / 2,
      y: page.getHeight() - top - size.height,
      ...size,
    });
    const date = new Date(sig.signedAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    text(`${sig.name} · ${date}`, x + 6, top + height - 14, width - 12, 7, false, 1);
  };
  text(issuer.companyName, 30, 24, 420, 19, true, 1);
  text(
    [issuer.ownerName, ...(issuer.footer[0]?.lines.slice(0, 2) ?? [])].filter(Boolean).join(" | "),
    30,
    51,
    460,
    8,
    false,
    2,
  );
  text(
    [issuer.contactPhone, issuer.contactEmail].filter(Boolean).join(" | "),
    30,
    77,
    460,
    8,
    false,
    1,
  );
  text("MONATS-LIEFERSCHEIN", 530, 28, 282, 20, true, 1);
  text("Verbrauchsmaterial - Wochennachweis", 550, 56, 260, 10, false, 1);
  rect(30, 101, 782, 29, true);
  text(
    `Monat / Jahr: ${note.month.slice(5)} / ${note.month.slice(0, 4)}`,
    39,
    109,
    210,
    10,
    true,
    1,
  );
  text(`Bestell-Nr.: ${note.orderNumber || "-"}`, 270, 109, 235, 9, true, 1);
  text(`Lieferschein-Nr.: ${note.number}`, 530, 109, 273, 9, true, 1);
  rect(30, 141, 384, 77);
  rect(426, 141, 386, 77);
  text("AUFTRAGNEHMER (LIEFERANT)", 39, 148, 365, 8, true, 1);
  text(
    [
      issuer.companyName,
      ...(issuer.footer[0]?.lines.slice(0, 2) ?? []),
      ...(issuer.footer.find((f) => f.heading === "Steuerangaben")?.lines.slice(0, 2) ?? []),
    ]
      .filter(Boolean)
      .join(" | "),
    39,
    166,
    365,
    8,
    false,
    4,
  );
  text("AUFTRAGGEBER & LIEFERADRESSE", 435, 148, 368, 8, true, 1);
  text(
    [issuer.customer.filter(Boolean).slice(0, 2).join(" · "), note.deliveryAddress].join("\n"),
    435,
    166,
    368,
    9,
    false,
    3,
  );
  const xs = [30, 156, 300, 444, 570, 812];
  for (let c = 0; c < 5; c++) {
    const x = xs[c]!,
      w = xs[c + 1]! - x;
    page.drawRectangle({ x, y: page.getHeight() - 231 - 42, width: w, height: 42, color: blue });
    const heading =
      c === 0
        ? "WOCHE / DATUM"
        : c === 4
          ? "WÖCHENTLICHE ABZEICHNUNG"
          : MATERIALS[c - 1]!.label.toUpperCase();
    page.drawText(heading, {
      x: x + 8,
      y: page.getHeight() - 248,
      size: c === 4 ? 9 : 9.5,
      font: bold,
      color: rgb(1, 1, 1),
    });
    if (c > 0)
      page.drawText(c === 4 ? "Unterschrift Auftraggeber" : MATERIALS[c - 1]!.detail, {
        x: x + 8,
        y: page.getHeight() - 263,
        size: 8,
        font: regular,
        color: rgb(1, 1, 1),
      });
  }
  for (let i = 0; i < 5; i++) {
    const row = note.rows[i]!,
      top = 273 + i * 35;
    for (let c = 0; c < 5; c++) rect(xs[c]!, top, xs[c + 1]! - xs[c]!, 35, i % 2 === 1);
    text(`Woche ${i + 1}`, 38, top + 3, 110, 9, true, 1);
    text(
      row.date ? row.date.split("-").reverse().join(".") : "Datum: __________",
      38,
      top + 18,
      110,
      8,
      false,
      1,
    );
    MATERIALS.forEach((material, j) =>
      text(
        row[material.key],
        xs[j + 1]! + 12,
        top + 10,
        xs[j + 2]! - xs[j + 1]! - 24,
        12,
        false,
        1,
      ),
    );
    await stamp(row.signature, 570, top + 2, 242, 32);
  }
  const totals = deliveryTotals(note);
  rect(30, 448, 782, 28, true);
  text("GESAMT (Monat)", 38, 456, 110, 9, true, 1);
  MATERIALS.forEach((m, i) =>
    text(
      `${deliveryNumber(totals[m.key])} ${m.unit}`,
      xs[i + 1]! + 8,
      456,
      xs[i + 2]! - xs[i + 1]! - 16,
      10,
      true,
      1,
    ),
  );
  text("Monatssumme", 635, 456, 160, 9, false, 1);
  text(
    "Bitte die wöchentlichen Mengen abzeichnen. Nachweis zur Abrechnung gemäß Bestellung.",
    30,
    483,
    780,
    8,
    false,
    1,
  );
  rect(30, 501, 384, 68);
  rect(426, 501, 386, 68);
  text(issuer.companyName, 39, 506, 366, 9, true, 1);
  text("Auftraggeber / Bauleitung (Monatsende)", 435, 506, 368, 9, true, 1);
  await stamp(note.supplierSignature, 39, 522, 366, 36);
  await stamp(note.customerSignature, 435, 522, 368, 36);
  text("Datum, Name & Unterschrift Auftragnehmer", 39, 558, 365, 7, false, 1);
  text("Datum, Name & Unterschrift Auftraggeber", 435, 558, 365, 7, false, 1);
}

export async function buildDeliveryNotePdf(
  issuer: Parameters<typeof appendDeliveryNote>[1],
  note: DeliveryNote,
  scan?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  await appendDeliveryNote(pdf, issuer, note, scan);
  return pdf.save();
}
