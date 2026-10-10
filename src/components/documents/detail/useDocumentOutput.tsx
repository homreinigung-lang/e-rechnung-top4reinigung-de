import { toast } from "sonner";
import { DOC_TYPE_LABEL } from "@/lib/format";

import { logAudit } from "@/lib/gobd";

import { downloadBytes } from "@/lib/pdf";
import { buildDocumentPdfBytes } from "@/lib/invoice-pdf";
import { buildZugferdXml, embedZugferdXml } from "@/lib/erechnung";

import type { useDocumentViewData } from "./useDocumentViewData";
import type { useDocumentPdfData } from "./useDocumentPdfData";
import type { useDocumentDetailForm } from "./useDocumentDetailForm";

export function useDocumentOutput(input: {
  assignOfficialNumberNow: ReturnType<typeof useDocumentViewData>["assignOfficialNumberNow"];
  buildPdfData: ReturnType<typeof useDocumentPdfData>["buildPdfData"];
  doc: ReturnType<typeof useDocumentViewData>["doc"];
  docNumber: ReturnType<typeof useDocumentViewData>["docNumber"];
  eRechnungInput: ReturnType<typeof useDocumentViewData>["eRechnungInput"];
  ensureHasItems: ReturnType<typeof useDocumentPdfData>["ensureHasItems"];
  id: ReturnType<typeof useDocumentDetailForm>["id"];
  persistBeforeOutput: ReturnType<typeof useDocumentPdfData>["persistBeforeOutput"];
  warnIfIncomplete: ReturnType<typeof useDocumentViewData>["warnIfIncomplete"];
}) {
  const {
    assignOfficialNumberNow,
    buildPdfData,
    doc,
    docNumber,
    eRechnungInput,
    ensureHasItems,
    id,
    persistBeforeOutput,
    warnIfIncomplete,
  } = input;
  async function exportZugferd() {
    if (!ensureHasItems()) return;
    if (!(await persistBeforeOutput())) return;
    const toastId = toast.loading("ZUGFeRD-PDF wird erzeugt…");
    try {
      const number = await assignOfficialNumberNow();
      const input = eRechnungInput(number);
      warnIfIncomplete(input);
      const pdfBytes = await buildDocumentPdfBytes(await buildPdfData(number));
      const hybrid = await embedZugferdXml(pdfBytes, buildZugferdXml(input), {
        number,
        title: DOC_TYPE_LABEL[doc.type] ?? "Rechnung",
      });
      downloadBytes(hybrid, `ZUGFeRD_${number.replace(/\W+/g, "_")}.pdf`);
      await logAudit(
        "zugferd_export",
        { id, number },
        { format: "ZUGFeRD 2.3 / Factur-X (EN 16931)" },
      );
      toast.success("ZUGFeRD-PDF (hybride E-Rechnung) erstellt", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message, { id: toastId });
    }
  }

  /**
   * Einzige PDF-Quelle der Wahrheit: Vorschau, Download und E-Mail-Anhang
   * verwenden ausschließlich diese Funktion mit denselben Daten.
   */
  async function makePdfBytes(): Promise<Uint8Array> {
    return buildDocumentPdfBytes(await buildPdfData());
  }

  /** Fertiges Dokument direkt als A4-PDF herunterladen (pdf-lib, kein Browser-Druck). */
  async function downloadPdf() {
    if (!(await persistBeforeOutput())) return;
    const toastId = toast.loading("PDF wird erzeugt…");
    try {
      const bytes = await makePdfBytes();
      downloadBytes(
        bytes,
        `${DOC_TYPE_LABEL[doc.type]}-${docNumber.replace(/\W+/g, "_")}.pdf`.replace(/\s+/g, "-"),
      );
      toast.success("PDF heruntergeladen", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message, { id: toastId });
    }
  }
  return { downloadPdf, exportZugferd, makePdfBytes };
}
