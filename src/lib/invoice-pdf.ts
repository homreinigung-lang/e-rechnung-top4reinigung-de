import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";


/**
 * Serverseitig/bibliotheksbasierte PDF-Erzeugung (pdf-lib) – kein Browser-Druck.
 * Dadurch entfallen automatische Kopf-/Fußzeilen des Browsers (Titel, URL, Datum).
 * Das Layout entspricht 1:1 der Bildschirm-Vorschau (DIN 5008).
 */

// ---- Seitenmaße / Ränder (A4, 15 mm seitlich, 14 mm oben/unten) -----------
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const M_X = 15 * MM;
const M_Y = 14 * MM;
const CONTENT_W = PAGE_W - 2 * M_X;

const COLOR_TEXT = rgb(0.067, 0.094, 0.153); // #111827
const COLOR_MUTED = rgb(0.42, 0.45, 0.5); // #6b7280
const COLOR_BORDER = rgb(0.82, 0.835, 0.858); // #d1d5db
const COLOR_HEAD_BG = rgb(0.953, 0.957, 0.965); // #f3f4f6
const COLOR_WHITE = rgb(1, 1, 1);

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

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  /** Untere Satzspiegelgrenze (Seitenrand + reservierte Fußzeile). */
  bottom: number;
};

/** Zeichen ersetzen, die in der WinAnsi-Kodierung fehlen. */
function clean(text: string): string {
  return (text ?? "")
    .replace(/\u202f|\u2009|\u2007/g, "\u00a0")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\S\n]/g, (c) => (c === "\u00a0" ? "\u00a0" : " "));
}

function widthOf(font: PDFFont, size: number, text: string): number {
  return font.widthOfTextAtSize(clean(text), size);
}

/** Text auf eine Breite umbrechen – Wörter werden nie zerschnitten. */
function wrap(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - M_Y;
}

/** Sorgt dafür, dass ein Block komplett auf eine Seite passt (page-break-inside: avoid). */
function ensure(ctx: Ctx, height: number) {
  if (ctx.y - height < ctx.bottom) newPage(ctx);
}

function text(
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

async function qrImageBytes(payload: string, px: number): Promise<Uint8Array> {
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

export async function buildDocumentPdfBytes(d: PdfDocData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.title);
  pdf.setProducer("GebCalc");
  pdf.setCreator("GebCalc");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - M_Y,
    regular,
    bold,
    bottom: M_Y,
  };

  // ---- Fußbereich vorab vermessen und als Satzspiegel-Reserve sperren -----
  const footCols = Math.max(1, d.footer.length);
  const footGap = 12;
  const footColW = (CONTENT_W - footGap * (footCols - 1)) / footCols;
  const footHeadLines = d.footer.map((col) => wrap(bold, 8, col.heading, footColW));

  const footColLines = d.footer.map((col) =>
    col.lines.filter(Boolean).flatMap((line) => wrap(regular, 7.5, line, footColW)),
  );
  const footHeadH = Math.max(...footHeadLines.map((l) => l.length)) * 10;
  const footH = Math.max(...footColLines.map((l) => l.length)) * 10 + footHeadH + 16;
  ctx.bottom = M_Y + footH + 12;

  // ---- Kopfbereich --------------------------------------------------------
  let logoImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (d.logo) {
    try {
      logoImage =
        d.logo.type === "png" ? await pdf.embedPng(d.logo.bytes) : await pdf.embedJpg(d.logo.bytes);
    } catch {
      logoImage = null;
    }
  }

  const logoH = 38;
  const logoW = logoImage ? Math.min(150, (logoImage.width / logoImage.height) * logoH) : 38;
  const headTop = ctx.y;

  if (logoImage) {
    ctx.page.drawImage(logoImage, { x: M_X, y: headTop - logoH, width: logoW, height: logoH });
  } else {
    ctx.page.drawRectangle({
      x: M_X,
      y: headTop - logoH,
      width: logoW,
      height: logoH,
      borderColor: COLOR_BORDER,
      borderWidth: 1,
      color: COLOR_HEAD_BG,
    });
    text(ctx, d.logoInitials, {
      x: M_X,
      y: headTop - logoH / 2 - 5,
      width: logoW,
      align: "center",
      size: 13,
      font: bold,
      color: COLOR_MUTED,
    });
  }

  const nameX = M_X + logoW + 14;
  text(ctx, d.companyName, { x: nameX, y: headTop - 15, size: 17, font: bold });
  if (d.ownerName) {
    text(ctx, `Inhaber: ${d.ownerName}`, {
      x: nameX,
      y: headTop - 28,
      size: 8,
      color: COLOR_MUTED,
    });
  }

  let contactY = headTop - 8;
  for (const line of [d.contactEmail, d.contactPhone].filter(Boolean) as string[]) {
    text(ctx, line, {
      x: M_X,
      y: contactY,
      width: CONTENT_W,
      align: "right",
      size: 8,
      color: COLOR_MUTED,
    });
    contactY -= 11;
  }

  ctx.y = headTop - Math.max(logoH, 34) - 24;

  // ---- Anschrift + Belegdaten --------------------------------------------
  const colW = (CONTENT_W - 24) / 2;
  const blockTop = ctx.y;

  text(ctx, d.senderLine, { x: M_X, y: blockTop, size: 7, color: COLOR_MUTED, width: colW });
  ctx.page.drawLine({
    start: { x: M_X, y: blockTop - 4 },
    end: { x: M_X + colW, y: blockTop - 4 },
    thickness: 0.5,
    color: COLOR_BORDER,
  });

  let addrY = blockTop - 20;
  d.customer.filter(Boolean).forEach((line, index) => {
    text(ctx, line, { x: M_X, y: addrY, size: 9.5, font: index === 0 ? bold : regular });
    addrY -= 12.5;
  });
  if (d.customerVatId) {
    addrY -= 3;
    text(ctx, `USt-IdNr.: ${d.customerVatId}`, { x: M_X, y: addrY, size: 8.5 });
    addrY -= 12;
  }

  const metaX = M_X + colW + 24;
  let metaY = blockTop;
  for (const row of d.meta) {
    const label = `${row.label}: `;
    const valueW = widthOf(bold, 9, row.value);
    text(ctx, row.value, { x: metaX, y: metaY, width: colW, align: "right", size: 9, font: bold });
    text(ctx, label, {
      x: metaX,
      y: metaY,
      width: colW - valueW,
      align: "right",
      size: 9,
      color: COLOR_MUTED,
    });
    metaY -= 13;
  }

  ctx.y = Math.min(addrY, metaY) - 18;

  // ---- Titel + Einleitung -------------------------------------------------
  if (d.headline) {
    const hLines = wrap(bold, 13, d.headline, CONTENT_W);
    ensure(ctx, hLines.length * 17 + 10);
    for (const line of hLines) {
      text(ctx, line, { y: ctx.y, size: 13, font: bold, align: "center" });
      ctx.y -= 17;
    }
    ctx.y -= 6;
  } else {
    ensure(ctx, 34);
    text(ctx, d.title, { y: ctx.y, size: 14.5, font: bold });
    ctx.y -= 18;
  }

  if (d.introText) {
    const lines = wrap(regular, 9.5, d.introText, CONTENT_W);
    // Einleitung nie allein am Seitenende stehen lassen – ggf. zusammen mit
    // dem Tabellenkopf auf die nächste Seite umbrechen (keep-with-next).
    ensure(ctx, lines.length * 12 + 6 + (d.items.length > 0 ? 50 : 0));
    for (const line of lines) {
      text(ctx, line, { y: ctx.y, size: 9.5 });
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }

  // ---- Positionstabelle ---------------------------------------------------
  const fractions = [0.07, 0.43, 0.1, 0.1, 0.15, 0.15];
  const colWidths = fractions.map((f) => f * CONTENT_W);
  const colX: number[] = [];
  fractions.reduce((acc, f, i) => {
    colX[i] = acc;
    return acc + f * CONTENT_W;
  }, M_X);

  const headers = [
    "Pos.",
    "Bezeichnung",
    "Menge",
    "Einheit",
    "Einzelpreis netto EUR",
    "Gesamtpreis netto EUR",
  ];
  const alignRight = [false, false, true, false, true, true];
  const padX = 5;
  const padY = 5;
  const rowSize = 9;

  // Wichtig: Erst in Großbuchstaben wandeln, dann umbrechen – sonst wird die
  // Breite zu klein berechnet und die Spaltenköpfe überlappen sich.
  const headLines = headers.map((h, i) =>
    wrap(bold, 7.5, h.toUpperCase(), colWidths[i]! - 2 * padX),
  );
  const headH = Math.max(...headLines.map((l) => l.length)) * 9.5 + 2 * padY;


  const drawTableHead = () => {
    ensure(ctx, headH + 20);
    const top = ctx.y;
    ctx.page.drawRectangle({
      x: M_X,
      y: top - headH,
      width: CONTENT_W,
      height: headH,
      color: COLOR_HEAD_BG,
      borderColor: COLOR_BORDER,
      borderWidth: 0.7,
    });
    headLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        text(ctx, line, {
          x: colX[i]! + padX,
          y: top - padY - 8 - li * 9.5,
          width: colWidths[i]! - 2 * padX,
          align: alignRight[i] ? "right" : "left",
          size: 7.5,
          font: bold,
          color: COLOR_MUTED,
        });
      });
    });
    ctx.y = top - headH;
  };

  const hasOptional = d.items.some((i) => i.optional);

  /** Voll­breite Band-Zeile (Abschnittstitel oder Zwischensumme). */
  const drawBandRow = (label: string, value?: string, filled = true) => {
    const h = 20;
    if (ctx.y - h < ctx.bottom) {
      newPage(ctx);
      drawTableHead();
    }
    const top = ctx.y;
    ctx.page.drawRectangle({
      x: M_X,
      y: top - h,
      width: CONTENT_W,
      height: h,
      color: filled ? COLOR_HEAD_BG : COLOR_WHITE,
      borderColor: COLOR_BORDER,
      borderWidth: 0.7,
    });
    text(ctx, label, { x: M_X + padX, y: top - 14, size: 9, font: bold });
    if (value) {
      text(ctx, value, {
        x: colX[5]! + padX,
        y: top - 14,
        width: colWidths[5]! - 2 * padX,
        align: "right",
        size: 9,
        font: bold,
      });
    }
    ctx.y = top - h;
  };

  if (d.items.length > 0) drawTableHead();

  const section = { current: "none" as "none" | "regular" | "optional" };

  d.items.forEach((item, index) => {
    if (hasOptional) {
      const wanted = item.optional ? "optional" : "regular";
      if (wanted !== section.current) {
        if (section.current === "regular" && d.regularSubtotal) {
          drawBandRow("Monatlicher Festpreis (netto)", d.regularSubtotal, false);
        }
        drawBandRow(wanted === "regular" ? "Regelmäßige Leistungen" : "Optionale Zusatzleistungen");
        section.current = wanted;
      }
    }

    const cells = [
      [String(index + 1)],
      wrap(regular, rowSize, item.description, colWidths[1]! - 2 * padX),
      [item.quantity],
      wrap(regular, rowSize, item.unit, colWidths[3]! - 2 * padX),
      [item.unitPrice],
      [item.total],
    ];
    const rowH = Math.max(...cells.map((c) => c.length)) * 12 + 2 * padY;

    // Zeile nie über den Seitenumbruch zerschneiden – ggf. komplett umbrechen.
    if (ctx.y - rowH < ctx.bottom) {
      newPage(ctx);
      drawTableHead();
    }

    const top = ctx.y;
    ctx.page.drawRectangle({
      x: M_X,
      y: top - rowH,
      width: CONTENT_W,
      height: rowH,
      borderColor: COLOR_BORDER,
      borderWidth: 0.7,
      color: COLOR_WHITE,
    });
    cells.forEach((lines, i) => {
      lines.forEach((line, li) => {
        text(ctx, line, {
          x: colX[i]! + padX,
          y: top - padY - 9 - li * 12,
          width: colWidths[i]! - 2 * padX,
          align: alignRight[i] ? "right" : "left",
          size: rowSize,
          font: i === 5 ? bold : regular,
        });
      });
    });
    ctx.y = top - rowH;
  });

  if (hasOptional && section.current === "regular" && d.regularSubtotal) {
    drawBandRow("Monatlicher Festpreis (netto)", d.regularSubtotal, false);
  }

  ctx.y -= 10;

  if (hasOptional && d.optionalNote) {
    const lines = wrap(regular, 8.5, d.optionalNote, CONTENT_W);
    ensure(ctx, lines.length * 11 + 8);
    lines.forEach((line, li) => {
      text(ctx, line, { x: M_X, y: ctx.y - li * 11, size: 8.5, color: COLOR_MUTED });
    });
    ctx.y -= lines.length * 11 + 8;
  }

  ctx.y -= 8;

  // ---- Leistungsbeschreibung ---------------------------------------------
  if (d.serviceDescription) {
    const entries = d.serviceDescription
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    ensure(ctx, 30);
    text(ctx, "Leistungsbeschreibung", { y: ctx.y, size: 11, font: bold });
    ctx.y -= 15;
    for (const entry of entries) {
      const bullet = /^[-•*]\s*/.test(entry);
      const body = entry.replace(/^[-•*]\s*/, "");
      const indent = bullet ? 12 : 0;
      const lines = wrap(regular, 9.5, body, CONTENT_W - indent);
      ensure(ctx, lines.length * 12 + 3);
      if (bullet) text(ctx, "-", { x: M_X, y: ctx.y, size: 9.5 });
      lines.forEach((line, li) => {
        text(ctx, line, {
          x: M_X + indent,
          y: ctx.y - li * 12,
          size: 9.5,
          font: bullet ? regular : bold,
        });
      });
      ctx.y -= lines.length * 12 + 3;
    }
    ctx.y -= 8;
  }

  // ---- Summenblock (nie zerschnitten) ------------------------------------
  // Der Summenblock wird zusammen mit einem direkt folgenden Steuerhinweis
  // als eine Einheit behandelt (break-inside: avoid für den gesamten Abschluss).
  // Breite dynamisch: Beschriftung und Betrag dürfen sich nie überlappen.
  const sumFont = (strong?: boolean) => (strong ? bold : regular);
  const sumSize = (strong?: boolean) => (strong ? 10.5 : 9.5);
  const neededSumW = d.summary.reduce((max, row) => {
    const w =
      widthOf(sumFont(row.strong), sumSize(row.strong), row.label) +
      widthOf(sumFont(row.strong), sumSize(row.strong), row.value) +
      18;
    return Math.max(max, w);
  }, 210);
  const sumW = Math.min(neededSumW, CONTENT_W);
  const sumX = M_X + CONTENT_W - sumW;
  const sumH = d.summary.length * 14 + 6;
  const taxNoteLines = d.taxNote ? wrap(regular, 8.5, d.taxNote, CONTENT_W - 12) : [];
  const taxNoteH = taxNoteLines.length > 0 ? taxNoteLines.length * 11 + 12 + 6 : 0;
  ensure(ctx, sumH + taxNoteH + 8);
  for (const row of d.summary) {
    if (row.rule) {
      ctx.page.drawLine({
        start: { x: sumX, y: ctx.y + 11 },
        end: { x: sumX + sumW, y: ctx.y + 11 },
        thickness: 0.7,
        color: COLOR_BORDER,
      });
    }
    const size = sumSize(row.strong);
    const font = sumFont(row.strong);
    const valueW = widthOf(font, size, row.value);
    // Zu lange Beschriftungen (z. B. Rabattgrund) werden gekürzt statt überlappt.
    let label = clean(row.label);
    const labelMaxW = sumW - valueW - 12;
    if (widthOf(font, size, label) > labelMaxW) {
      while (label.length > 3 && widthOf(font, size, `${label}...`) > labelMaxW) {
        label = label.slice(0, -1);
      }
      label = `${label.trimEnd()}...`;
    }
    text(ctx, label, {
      x: sumX,
      y: ctx.y,
      size,
      font,
      color: row.strong ? COLOR_TEXT : COLOR_MUTED,
    });
    text(ctx, row.value, {
      x: sumX,
      y: ctx.y,
      width: sumW,
      align: "right",
      size,
      font,
    });
    ctx.y -= 14;
  }

  ctx.y -= 8;

  // ---- Steuerhinweis (Zeilen bereits oben umbrochen) ----------------------
  if (d.taxNote && taxNoteLines.length > 0) {
    const lines = taxNoteLines;
    const boxH = lines.length * 11 + 12;
    ctx.page.drawRectangle({
      x: M_X,
      y: ctx.y - boxH + 10,
      width: CONTENT_W,
      height: boxH,
      color: COLOR_HEAD_BG,
    });
    lines.forEach((line, li) => {
      text(ctx, line, { x: M_X + 6, y: ctx.y - li * 11, size: 8.5 });
    });
    ctx.y -= boxH + 6;
  }

  // ---- Freitext-Notizen ---------------------------------------------------
  if (d.notes) {
    const lines = wrap(regular, 9.5, d.notes, CONTENT_W);
    ensure(ctx, lines.length * 12 + 6);
    lines.forEach((line, li) => text(ctx, line, { y: ctx.y - li * 12, size: 9.5 }));
    ctx.y -= lines.length * 12 + 8;
  }


  // ---- Zahlungshinweis + GiroCode ----------------------------------------
  if ((d.paymentLines && d.paymentLines.length > 0) || d.qrPayload) {
    const qrSize = d.qrPayload ? 68 : 0;
    const boxW = d.qrPayload ? qrSize + 120 : 0;
    const textW = CONTENT_W - boxW - (boxW > 0 ? 16 : 0);
    const payLines = (d.paymentLines ?? []).flatMap((line, li, all) =>
      wrap(regular, li === all.length - 1 ? 8 : 9.5, line, textW).map((l) => ({
        text: l,
        muted: li === all.length - 1,
      })),
    );
    const blockH = Math.max(payLines.length * 12 + 6, qrSize + 16);
    // Zahlungsblock und Fußbereich bilden eine Einheit – kein Umbruch dazwischen.
    if (ctx.y - blockH < ctx.bottom) newPage(ctx);
    const top = ctx.y;
    payLines.forEach((line, li) => {
      text(ctx, line.text, {
        x: M_X,
        y: top - li * 12,
        size: line.muted ? 8 : 9.5,
        color: line.muted ? COLOR_MUTED : COLOR_TEXT,
        width: textW,
      });
    });
    if (d.qrPayload) {
      try {
        const image = await pdf.embedPng(await qrImageBytes(d.qrPayload, qrSize * 4));
        const boxX = M_X + CONTENT_W - boxW;
        const boxY = top + 10 - blockH;
        ctx.page.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxW,
          height: blockH,
          borderColor: COLOR_BORDER,
          borderWidth: 0.7,
          color: COLOR_WHITE,
        });
        text(ctx, "Überweisen per Code", { x: boxX + 10, y: top - 6, size: 9, font: bold });
        wrap(regular, 7.5, "Ganz bequem Code mit der Banking-App scannen.", 96).forEach((l, li) => {
          text(ctx, l, { x: boxX + 10, y: top - 19 - li * 9.5, size: 7.5, color: COLOR_MUTED });
        });
        ctx.page.drawImage(image, {
          x: boxX + boxW - qrSize - 10,
          y: boxY + (blockH - qrSize) / 2,
          width: qrSize,
          height: qrSize,
        });
      } catch {
        /* QR optional */
      }
    }
    ctx.y = top - blockH - 6;
  }

  // ---- Fußbereich (auf jeder Seite, fest am unteren Rand, nie überlappend) --

  const footTop = M_Y + footH - 14;
  for (const page of pdf.getPages()) {
    ctx.page = page;
    page.drawLine({
      start: { x: M_X, y: footTop + 6 },
      end: { x: M_X + CONTENT_W, y: footTop + 6 },
      thickness: 0.7,
      color: COLOR_BORDER,
    });
    d.footer.forEach((col, i) => {
      const x = M_X + i * (footColW + footGap);
      footHeadLines[i]!.forEach((line, li) => {
        text(ctx, line, { x, y: footTop - 6 - li * 10, size: 8, font: bold, width: footColW });
      });
      footColLines[i]!.forEach((line, li) => {
        text(ctx, line, {
          x,
          y: footTop - 8 - footHeadH - li * 10,
          size: 7.5,
          color: COLOR_MUTED,
          width: footColW,
        });
      });
    });
  }
  ctx.y = M_Y;

  // ---- Stempel/Wasserzeichen (z. B. "STORNIERT") auf jeder Seite ----------
  if (d.watermark) {
    const label = clean(d.watermark).toUpperCase();
    const size = Math.min(72, (CONTENT_W * 1.15) / Math.max(1, widthOf(bold, 1, label)));
    const w = widthOf(bold, size, label);
    for (const page of pdf.getPages()) {
      page.drawText(label, {
        x: (PAGE_W - w * Math.cos(Math.PI / 6)) / 2,
        y: (PAGE_H - w * Math.sin(Math.PI / 6)) / 2,
        size,
        font: bold,
        color: rgb(0.86, 0.15, 0.15),
        opacity: 0.16,
        rotate: degrees(30),
      });
      if (d.watermarkNote) {
        const note = clean(d.watermarkNote);
        const noteSize = 10;
        const noteW = widthOf(bold, noteSize, note);
        page.drawText(note, {
          x: Math.max(20, (PAGE_W - noteW) / 2),
          y: PAGE_H / 2 - size * 0.9,
          size: noteSize,
          font: bold,
          color: rgb(0.86, 0.15, 0.15),
          opacity: 0.55,
        });
      }
    }
  }

  return pdf.save();

}
