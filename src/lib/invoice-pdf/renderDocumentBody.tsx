import {
  M_X,
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
} from "./shared";

import type { renderDocumentHeader } from "./renderDocumentHeader";
import type { buildDocumentPdfBytes } from "./buildDocumentPdfBytes";

export function renderDocumentBody(input: {
  alignRight: Awaited<ReturnType<typeof renderDocumentHeader>>["alignRight"];
  bold: Awaited<ReturnType<typeof renderDocumentHeader>>["bold"];
  colWidths: Awaited<ReturnType<typeof renderDocumentHeader>>["colWidths"];
  colX: Awaited<ReturnType<typeof renderDocumentHeader>>["colX"];
  ctx: Awaited<ReturnType<typeof renderDocumentHeader>>["ctx"];
  d: Parameters<typeof buildDocumentPdfBytes>[0];
  drawTableHead: Awaited<ReturnType<typeof renderDocumentHeader>>["drawTableHead"];
  padX: Awaited<ReturnType<typeof renderDocumentHeader>>["padX"];
  padY: Awaited<ReturnType<typeof renderDocumentHeader>>["padY"];
  regular: Awaited<ReturnType<typeof renderDocumentHeader>>["regular"];
  rowSize: Awaited<ReturnType<typeof renderDocumentHeader>>["rowSize"];
}) {
  const { alignRight, bold, colWidths, colX, ctx, d, drawTableHead, padX, padY, regular, rowSize } =
    input;
  const hasOptional = d.items.some((i) => i.optional);

  const BAND_H = 20;

  /** Voll­breite Band-Zeile (Abschnittstitel oder Zwischensumme). */
  const drawBandRow = (label: string, value?: string, filled = true, keepWith = 0) => {
    const h = BAND_H;
    if (ctx.y - h - keepWith < ctx.bottom) {
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
    const cells = [
      [String(index + 1)],
      wrap(regular, rowSize, item.description, colWidths[1]! - 2 * padX),
      [item.quantity],
      wrap(regular, rowSize, item.unit, colWidths[3]! - 2 * padX),
      [item.unitPrice],
      [item.total],
    ];
    const rowH = Math.max(...cells.map((c) => c.length)) * 12 + 2 * padY;

    if (hasOptional) {
      const wanted = item.optional ? "optional" : "regular";
      if (wanted !== section.current) {
        if (section.current === "regular" && d.regularSubtotal) {
          drawBandRow("Monatlicher Festpreis (netto)", d.regularSubtotal, false);
        }
        // Abschnittstitel bleibt mit der ersten Position zusammen (keep-with-next).
        drawBandRow(
          wanted === "regular" ? "Regelmäßige Leistungen" : "Saisonale & zusätzliche Leistungen",
          undefined,
          true,
          rowH,
        );
        section.current = wanted;
      }
    }

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
    // Überschrift nie allein am Seitenende (keep-with-next mit dem 1. Eintrag).
    const firstEntry = entries[0] ?? "";
    const firstLines = wrap(
      regular,
      9.5,
      firstEntry.replace(/^[-•*]\s*/, ""),
      CONTENT_W - (/^[-•*]\s*/.test(firstEntry) ? 12 : 0),
    );
    ensure(ctx, 15 + firstLines.length * 12 + 6);
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
  return { taxNoteLines };
}
