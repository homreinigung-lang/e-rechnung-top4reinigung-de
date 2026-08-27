import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate, formatMoney, formatNumber, today } from "@/lib/format";

/**
 * Erzeugt ein Leistungsverzeichnis (LV) als PDF – vektorbasiert mit pdf-lib,
 * geeignet zur Abgabe bei einer Vergabestelle (z. B. Vergabe Saarland).
 */

const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const M_X = 18 * MM;
const M_Y = 16 * MM;
const CONTENT_W = PAGE_W - 2 * M_X;

const TEXT = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.72, 0.75, 0.79);
const HEAD_BG = rgb(0.945, 0.951, 0.961);

export type LvPosition = {
  /** Ordnungszahl, z. B. "1.10" */
  oz: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type LvPdfData = {
  title: string;
  reference?: string;
  proposalText?: string;
  objectDescription?: string;
  company: {
    name: string;
    ownerName?: string;
    addressLine?: string;
    postalCode?: string;
    city?: string;
    email?: string;
    phone?: string;
    vatId?: string;
    taxNumber?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
  };
  meta: Array<{ label: string; value: string }>;
  positions: LvPosition[];
  vatRate: number;
  /** Pflichthinweis bei 0 % (Reverse-Charge oder § 19 UStG). */
  taxNote?: string;
};


function clean(value: string): string {
  return (value ?? "")
    .replace(/\u202f|\u2009|\u2007/g, "\u00a0")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\u2026/g, "...");
}

function wrap(font: PDFFont, size: number, value: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(value).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export async function buildLvPdf(data: LvPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M_Y;

  const nextPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - M_Y;
  };
  const ensure = (height: number) => {
    if (y - height < M_Y + 12) nextPage();
  };
  const draw = (
    value: string,
    x: number,
    yy: number,
    size: number,
    font: PDFFont = regular,
    color = TEXT,
    align: "left" | "right" = "left",
    width = 0,
  ) => {
    const t = clean(value);
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: align === "right" ? x + width - w : x, y: yy, size, font, color });
  };

  // ---- Kopf ---------------------------------------------------------------
  const c = data.company;
  draw(c.name, M_X, y - 12, 15, bold);
  const senderLines = [
    [c.addressLine, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
    [c.phone ? `Tel. ${c.phone}` : "", c.email].filter(Boolean).join(" · "),
    [c.vatId ? `USt-IdNr. ${c.vatId}` : "", c.taxNumber ? `St.-Nr. ${c.taxNumber}` : ""]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
  let hy = y - 12;
  for (const line of senderLines) {
    hy -= 11;
    draw(line, M_X, hy, 8.5, regular, MUTED);
  }
  y = hy - 22;

  draw("Leistungsverzeichnis (LV)", M_X, y, 13, bold);
  y -= 16;
  for (const line of wrap(bold, 11, data.title || "Ausschreibung", CONTENT_W)) {
    draw(line, M_X, y, 11, bold);
    y -= 14;
  }
  if (data.reference?.trim()) {
    for (const line of wrap(regular, 9, `Vergabe-/Los-Referenz: ${data.reference}`, CONTENT_W)) {
      draw(line, M_X, y, 9, regular, MUTED);
      y -= 12;
    }
  }
  y -= 4;

  const meta = [{ label: "Datum", value: formatDate(today()) }, ...data.meta];
  for (const m of meta) {
    ensure(14);
    draw(`${m.label}:`, M_X, y, 9, bold);
    draw(m.value, M_X + 34 * MM, y, 9);
    y -= 12;
  }
  y -= 10;

  const block = (heading: string, body?: string) => {
    if (!body?.trim()) return;
    ensure(30);
    draw(heading, M_X, y, 10, bold);
    y -= 13;
    for (const line of wrap(regular, 9, body.trim(), CONTENT_W)) {
      ensure(12);
      draw(line, M_X, y, 9);
      y -= 11;
    }
    y -= 8;
  };
  block("Objektbeschreibung", data.objectDescription);
  block("Angebots- und Ausschreibungstext", data.proposalText);

  // ---- Tabelle ------------------------------------------------------------
  const colOz = M_X;
  const wOz = 16 * MM;
  const wQty = 18 * MM;
  const wUnit = 16 * MM;
  const wPrice = 24 * MM;
  const wTotal = 26 * MM;
  const wDesc = CONTENT_W - wOz - wQty - wUnit - wPrice - wTotal;
  const colDesc = colOz + wOz;
  const colQty = colDesc + wDesc;
  const colUnit = colQty + wQty;
  const colPrice = colUnit + wUnit;
  const colTotal = colPrice + wPrice;

  const drawHead = () => {
    ensure(20);
    page.drawRectangle({
      x: M_X,
      y: y - 15,
      width: CONTENT_W,
      height: 16,
      color: HEAD_BG,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    const ty = y - 11;
    draw("OZ", colOz + 3, ty, 8.5, bold);
    draw("Leistungsbeschreibung", colDesc + 3, ty, 8.5, bold);
    draw("Menge", colQty, ty, 8.5, bold, TEXT, "right", wQty - 3);
    draw("Einheit", colUnit + 3, ty, 8.5, bold);
    draw("EP (netto)", colPrice, ty, 8.5, bold, TEXT, "right", wPrice - 3);
    draw("GP (netto)", colTotal, ty, 8.5, bold, TEXT, "right", wTotal - 3);
    y -= 16;
  };

  drawHead();

  let net = 0;
  for (const p of data.positions) {
    const lines = wrap(regular, 9, p.description || "—", wDesc - 6);
    const rowH = Math.max(16, lines.length * 11 + 6);
    if (y - rowH < M_Y + 60) {
      nextPage();
      drawHead();
    }
    page.drawRectangle({
      x: M_X,
      y: y - rowH,
      width: CONTENT_W,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    for (const x of [colDesc, colQty, colUnit, colPrice, colTotal]) {
      page.drawLine({
        start: { x, y: y - rowH },
        end: { x, y },
        color: BORDER,
        thickness: 0.6,
      });
    }
    const total = p.quantity * p.unitPrice;
    net += total;
    const ty = y - 12;
    draw(p.oz, colOz + 3, ty, 9);
    lines.forEach((line, idx) => draw(line, colDesc + 3, ty - idx * 11, 9));
    draw(formatNumber(p.quantity), colQty, ty, 9, regular, TEXT, "right", wQty - 3);
    draw(p.unit, colUnit + 3, ty, 9);
    draw(formatMoney(p.unitPrice), colPrice, ty, 9, regular, TEXT, "right", wPrice - 3);
    draw(formatMoney(total), colTotal, ty, 9, bold, TEXT, "right", wTotal - 3);
    y -= rowH;
  }

  // ---- Summen -------------------------------------------------------------
  y -= 14;
  ensure(60);
  const rate = Number.isFinite(data.vatRate) ? data.vatRate : 0;
  const vat = (net * rate) / 100;
  const sums: Array<[string, string, boolean]> =
    rate > 0
      ? [
          ["Angebotssumme netto", formatMoney(net), false],
          [`zzgl. ${formatNumber(rate)} % USt.`, formatMoney(vat), false],
          ["Angebotssumme brutto", formatMoney(net + vat), true],
        ]
      : [
          ["Angebotssumme netto", formatMoney(net), false],
          ["Umsatzsteuer", "0,00 €", false],
          ["Angebotssumme gesamt", formatMoney(net), true],
        ];
  const sumX = M_X + CONTENT_W - 80 * MM;
  for (const [label, value, strong] of sums) {
    if (strong) {
      page.drawLine({
        start: { x: sumX, y: y + 4 },
        end: { x: M_X + CONTENT_W, y: y + 4 },
        color: BORDER,
        thickness: 0.8,
      });
      y -= 4;
    }
    draw(label, sumX, y, strong ? 10.5 : 9.5, strong ? bold : regular);
    draw(
      value,
      M_X + CONTENT_W - 40 * MM,
      y,
      strong ? 10.5 : 9.5,
      strong ? bold : regular,
      TEXT,
      "right",
      40 * MM,
    );
    y -= 14;
  }

  // ---- Steuerlicher Pflichthinweis (Reverse-Charge / § 19 UStG) ------------
  if (data.taxNote?.trim()) {
    y -= 6;
    for (const line of wrap(regular, 8.5, data.taxNote.trim(), CONTENT_W)) {
      ensure(12);
      draw(line, M_X, y, 8.5, regular, MUTED);
      y -= 10;
    }
  }


  // ---- Fuß ----------------------------------------------------------------
  const footerLines = [
    `${c.name}${c.ownerName ? ` · ${c.ownerName}` : ""}`,
    [c.addressLine, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [c.bankName, c.iban ? `IBAN ${c.iban}` : "", c.bic ? `BIC ${c.bic}` : ""]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
  for (const p of pdf.getPages()) {
    let fy = M_Y - 4;
    for (const line of [...footerLines].reverse()) {
      p.drawText(clean(line), { x: M_X, y: fy, size: 7.5, font: regular, color: MUTED });
      fy += 9;
    }
  }

  return pdf.save();
}
