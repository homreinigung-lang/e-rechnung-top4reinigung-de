import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export const MM = 72 / 25.4;

export const PAGE_W = 210 * MM;

export const PAGE_H = 297 * MM;

export const M_X = 15 * MM;

export const M_Y = 14 * MM;

export const CONTENT_W = PAGE_W - 2 * M_X;

export const COLOR_TEXT = rgb(0.067, 0.094, 0.153);

export const COLOR_MUTED = rgb(0.42, 0.45, 0.5);

export const COLOR_BORDER = rgb(0.82, 0.835, 0.858);

export const COLOR_HEAD_BG = rgb(0.953, 0.957, 0.965);

export const COLOR_WHITE = rgb(1, 1, 1);

export type PdfItem = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  optional?: boolean | undefined;
};

export type PdfDocData = {
  isInvoice: boolean;
  title: string; // z. B. "Rechnung RE-2026-0001"
  /** Zentrierte Hauptüberschrift (nur Angebote); ersetzt die Titelzeile. */
  headline?: string | undefined;

  logo?: { bytes: Uint8Array; type: "png" | "jpg" } | null | undefined;
  logoInitials: string;
  companyName: string;
  ownerName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  senderLine: string;
  customer: string[];
  customerVatId?: string | undefined;
  meta: Array<{ label: string; value: string }>;
  introText?: string | undefined;
  items: PdfItem[];
  /** Zwischensumme der regelmäßigen Leistungen (nur wenn optionale Positionen existieren). */
  regularSubtotal?: string | undefined;
  optionalNote?: string | undefined;
  serviceDescription?: string | undefined;
  summary: Array<{ label: string; value: string; strong?: boolean; rule?: boolean }>;
  taxNote?: string | undefined;
  notes?: string | undefined;
  paymentLines?: string[] | undefined;
  qrPayload?: string | null | undefined;
  footer: Array<{ heading: string; lines: string[] }>;
  /** Diagonaler Stempel über dem gesamten Beleg, z. B. "Storniert". */
  watermark?: string | undefined;
  /** Begründung unter dem Stempel, z. B. der offizielle Stornogrund. */
  watermarkNote?: string | undefined;
};

export type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  /** Untere Satzspiegelgrenze (Seitenrand + reservierte Fußzeile). */
  bottom: number;
};

export function clean(text: string): string {
  return (text ?? "")
    .replace(/\u202f|\u2009|\u2007/g, "\u00a0")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\S\n]/g, (c) => (c === "\u00a0" ? "\u00a0" : " "));
}

export function widthOf(font: PDFFont, size: number, text: string): number {
  return font.widthOfTextAtSize(clean(text), size);
}

export function wrap(font: PDFFont, size: number, value: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(value).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        out.push(line);
        line = "";
      }
      // Very long URLs, identifiers and uninterrupted descriptions must not
      // run outside the invoice table or the page margins.
      let chunk = "";
      for (const char of word) {
        const next = chunk + char;
        if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
          out.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    if (line) out.push(line);
  }
  return out;
}

export function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M_Y;
}

export function ensure(ctx: Ctx, height: number) {
  if (ctx.y - height < ctx.bottom) newPage(ctx);
}

export function text(
  ctx: Ctx,
  value: string,
  opts: {
    x?: number;
    y?: number;
    size?: number;
    font?: PDFFont;
    color?: RGB;
    align?: "left" | "right" | "center";
    width?: number;
  } = {},
) {
  const size = opts.size ?? 9.5;
  const font = opts.font ?? ctx.regular;
  const value2 = clean(value);
  const w = font.widthOfTextAtSize(value2, size);
  const boxW = opts.width ?? CONTENT_W;
  let x = opts.x ?? M_X;
  if (opts.align === "right") x = (opts.x ?? M_X) + boxW - w;
  if (opts.align === "center") x = (opts.x ?? M_X) + (boxW - w) / 2;
  ctx.page.drawText(value2, { x, y: opts.y ?? ctx.y, size, font, color: opts.color ?? COLOR_TEXT });
}

export async function qrImageBytes(payload: string, px: number): Promise<Uint8Array> {
  const QRCode = (await import("qrcode")).default;
  const dataUrl = await QRCode.toDataURL(payload, {
    margin: 0,
    width: px,
    errorCorrectionLevel: "M",
    color: { dark: "#111827", light: "#ffffff" },
  });
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
