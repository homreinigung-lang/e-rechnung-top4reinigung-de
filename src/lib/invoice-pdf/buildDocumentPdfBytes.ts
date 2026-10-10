import { renderDocumentHeader } from "./renderDocumentHeader";
import { renderDocumentBody } from "./renderDocumentBody";
import { renderDocumentFooter } from "./renderDocumentFooter";

import { type PdfDocData } from "./shared";

export async function buildDocumentPdfBytes(d: PdfDocData): Promise<Uint8Array> {
  const {
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
  } = await renderDocumentHeader({ d });

  const { taxNoteLines } = renderDocumentBody({
    alignRight,
    bold,
    colWidths,
    colX,
    ctx,
    d,
    drawTableHead,
    padX,
    padY,
    regular,
    rowSize,
  });

  // ---- Steuerhinweis (Zeilen bereits oben umbrochen) ----------------------
  const _renderDocumentFooter = await renderDocumentFooter({
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
  });

  return pdf.save();
}
