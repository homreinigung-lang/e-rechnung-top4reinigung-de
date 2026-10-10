import { degrees, rgb } from "pdf-lib";
import {
  PAGE_W,
  PAGE_H,
  M_X,
  M_Y,
  CONTENT_W,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_BORDER,
  COLOR_HEAD_BG,
  COLOR_WHITE,
  clean,
  widthOf,
  wrap,
  newPage,
  ensure,
  text,
  qrImageBytes,
} from "./shared";

import type { renderDocumentHeader } from "./renderDocumentHeader";
import type { buildDocumentPdfBytes } from "./buildDocumentPdfBytes";
import type { renderDocumentBody } from "./renderDocumentBody";

export async function renderDocumentFooter(input: {
  bold: Awaited<ReturnType<typeof renderDocumentHeader>>["bold"];
  ctx: Awaited<ReturnType<typeof renderDocumentHeader>>["ctx"];
  d: Parameters<typeof buildDocumentPdfBytes>[0];
  footColLines: Awaited<ReturnType<typeof renderDocumentHeader>>["footColLines"];
  footColW: Awaited<ReturnType<typeof renderDocumentHeader>>["footColW"];
  footGap: Awaited<ReturnType<typeof renderDocumentHeader>>["footGap"];
  footH: Awaited<ReturnType<typeof renderDocumentHeader>>["footH"];
  footHeadH: Awaited<ReturnType<typeof renderDocumentHeader>>["footHeadH"];
  footHeadLines: Awaited<ReturnType<typeof renderDocumentHeader>>["footHeadLines"];
  pdf: Awaited<ReturnType<typeof renderDocumentHeader>>["pdf"];
  regular: Awaited<ReturnType<typeof renderDocumentHeader>>["regular"];
  taxNoteLines: ReturnType<typeof renderDocumentBody>["taxNoteLines"];
}) {
  const {
    bold,
    ctx,
    d,
    footColLines,
    footColW,
    footGap,
    footH,
    footHeadH,
    footHeadLines,
    pdf,
    regular,
    taxNoteLines,
  } = input;
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
      } catch (e) {
        // GiroCode ist optional; die Rechnung bleibt ohne QR-Code gültig.
        console.warn("GiroCode konnte nicht erzeugt werden:", e);
      }
    }
    ctx.y = top - blockH - 6;
  }

  // ---- Fußbereich (auf jeder Seite, fest am unteren Rand, nie überlappend) --

  const footTop = M_Y + footH - 14;
  const pages = pdf.getPages();
  pages.forEach((page, pageIndex) => {
    ctx.page = page;
    // Seitenzahl nur bei mehrseitigen Belegen (DIN 5008), über der Fußzeilenlinie.
    if (pages.length > 1) {
      text(ctx, `Seite ${pageIndex + 1} von ${pages.length}`, {
        x: M_X,
        y: footTop + 12,
        width: CONTENT_W,
        align: "right",
        size: 7.5,
        color: COLOR_MUTED,
      });
    }

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
  });

  ctx.y = M_Y;

  // ---- Runder Gruppen-Stempel (Ring + Text als EINE Einheit, 45°) -------
  // Kreis und Schrift werden um denselben Mittelpunkt (Seitenmitte) gelegt
  // und gemeinsam um 45° gedreht – sie bilden damit einen einzigen Stempel.
  if (d.watermark) {
    const label = clean(d.watermark).toUpperCase();
    const size = Math.min(64, 380 / Math.max(1, widthOf(bold, 1, label)));
    const w = widthOf(bold, size, label);
    const hh = size * 0.36; // halbe Glyphenhöhe (Grundlinie → optische Mitte)
    const cx = PAGE_W / 2;
    const cy = PAGE_H / 2;
    // Rotationswinkel der ganzen Stempel-Gruppe
    const theta = Math.PI / 4; // 45°
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // Außenradius so, dass der Text mit komfortablem Abstand im Ring liegt
    const r = Math.max(w, size) / 2 + 26;
    const ringColor = rgb(0.86, 0.15, 0.15);
    for (const page of pdf.getPages()) {
      // 1) Hintergrund-Füllung des Stempels (sehr dezent)
      page.drawCircle({
        x: cx,
        y: cy,
        size: r,
        color: rgb(1, 0.95, 0.95),
        opacity: 0.08,
      });
      // 2) Äußerer Ring (kräftig)
      page.drawCircle({
        x: cx,
        y: cy,
        size: r,
        borderColor: ringColor,
        borderWidth: 3,
        opacity: 0.22,
      });
      // 3) Innerer Ring (fein) – klassischer Doppelring-Stempel
      page.drawCircle({
        x: cx,
        y: cy,
        size: r - 8,
        borderColor: ringColor,
        borderWidth: 1,
        opacity: 0.2,
      });
      // 4) Text, exakt im Kreismittelpunkt zentriert und mit der Gruppe
      //    um 45° gedreht (Rotation erfolgt um den Basispunkt des Textes).
      page.drawText(label, {
        x: cx - (w / 2) * cos + hh * sin,
        y: cy - (w / 2) * sin - hh * cos,
        size,
        font: bold,
        color: ringColor,
        opacity: 0.28,
        rotate: degrees(45),
      });
      if (d.watermarkNote) {
        const note = clean(d.watermarkNote);
        const noteSize = 10;
        const noteW = widthOf(bold, noteSize, note);
        const noteX = Math.max(M_X, (PAGE_W - noteW) / 2);
        // Direkt ÜBER der Fußzeile platzieren (nie über dem Briefkopf):
        // Fußzeilen-Trennlinie liegt bei footTop + 6, Box sitzt darüber.
        const noteY = footTop + 14;
        const noteBoxH = 18;
        page.drawRectangle({
          x: M_X,
          y: noteY - 4,
          width: CONTENT_W,
          height: noteBoxH,
          color: rgb(1, 0.95, 0.95),
          borderColor: rgb(0.86, 0.15, 0.15),
          borderWidth: 0.7,
          opacity: 0.85,
        });
        page.drawText(note, {
          x: noteX,
          y: noteY,
          size: noteSize,
          font: bold,
          color: rgb(0.86, 0.15, 0.15),
        });
      }
    }
  }
  return {};
}
