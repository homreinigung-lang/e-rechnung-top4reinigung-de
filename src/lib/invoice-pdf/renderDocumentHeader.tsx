import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  PAGE_W,
  PAGE_H,
  M_X,
  M_Y,
  CONTENT_W,
  COLOR_MUTED,
  COLOR_BORDER,
  COLOR_HEAD_BG,
  type Ctx,
  widthOf,
  wrap,
  ensure,
  text,
} from "./shared";

import type { buildDocumentPdfBytes } from "./buildDocumentPdfBytes";

export async function renderDocumentHeader(input: {
  d: Parameters<typeof buildDocumentPdfBytes>[0];
}) {
  const { d } = input;
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
    } catch (e) {
      // Das Logo ist optional – der Beleg wird ohne Logo erzeugt, der Fehler
      // wird aber protokolliert, damit fehlerhafte Uploads auffallen.
      console.warn("Firmenlogo konnte nicht in das PDF eingebettet werden:", e);
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
    const hLines = wrap(bold, 16, d.headline, CONTENT_W);
    ensure(ctx, hLines.length * 21 + 10);
    for (const line of hLines) {
      text(ctx, line, { y: ctx.y, size: 16, font: bold, align: "center" });
      ctx.y -= 21;
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

  let tableStarted = false;

  const drawTableHead = () => {
    ensure(ctx, headH + 24);
    if (tableStarted) {
      // Fortsetzungshinweis auf Folgeseiten (Lesbarkeit + Nachvollziehbarkeit).
      text(ctx, "Fortsetzung der Positionsliste", {
        x: M_X,
        y: ctx.y,
        size: 8,
        font: bold,
        color: COLOR_MUTED,
      });
      ctx.y -= 12;
    }
    tableStarted = true;
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
  return {
    alignRight,
    bold,
    colWidths,
    colX,
    ctx,
    drawTableHead,
    footColLines,
    footColW,
    footGap,
    footH,
    footHeadH,
    footHeadLines,
    padX,
    padY,
    pdf,
    regular,
    rowSize,
  };
}
