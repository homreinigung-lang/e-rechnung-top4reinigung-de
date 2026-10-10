import { useDocumentDetailForm } from "./useDocumentDetailForm";
import { useDocumentDetailPersistence } from "./useDocumentDetailPersistence";
import { useDocumentCancellation } from "./useDocumentCancellation";
import { useDocumentPayments } from "./useDocumentPayments";
import { useDocumentDetailWorkflow } from "./useDocumentDetailWorkflow";
import { useDocumentViewData } from "./useDocumentViewData";
import { useDocumentPdfData } from "./useDocumentPdfData";
import { useDocumentOutput } from "./useDocumentOutput";

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { archiveDocumentPdf, finalizeDocument, logAudit } from "@/lib/gobd";
import { ensureOfficialNumber } from "@/lib/doc-number";
import { deleteBlockedMessage, describeGobdError, isLockedDocument } from "@/lib/gobd-guard";

import { buildDocumentPdfBytes } from "@/lib/invoice-pdf";
import { buildXRechnungXml, downloadXml } from "@/lib/erechnung";

export function useDocumentDetailState() {
  const {
    autoSavedAt,
    baselineFormRef,
    bearbeiten,
    confirmDialog,
    data,
    discountAmount,
    discountItemPresent,
    discountPercent,
    discountReason,
    editMode,
    form,
    grossTotal,
    hasOptionalItems,
    id,
    isLoading,
    isPrivat,
    isSmallBusiness,
    items,
    itemsTotal,
    logoSrc,
    mailOpen,
    navigate,
    netTotal,
    payDate,
    payOpen,
    persistDocument,
    persistRef,
    queryClient,
    quoteRecipientMode,
    regularTotal,
    reverseChargeAllowed,
    savedSnapshotRef,
    setAutoSavedAt,
    setConfirmDialog,
    setEditMode,
    setForm,
    setItems,
    setMailOpen,
    setPayDate,
    setPayOpen,
    setQuoteRecipientMode,
    setStornoOpen,
    setStornoReason,
    stornoOpen,
    stornoReason,
    taxMode,
    taxNote,
    vatAmount,
    vatRate,
  } = useDocumentDetailForm();

  const { duplicate, save } = useDocumentDetailPersistence({
    baselineFormRef,
    bearbeiten,
    data,
    editMode,
    form,
    id,
    items,
    navigate,
    persistDocument,
    persistRef,
    queryClient,
    savedSnapshotRef,
    setAutoSavedAt,
    setEditMode,
  });

  // GoBD: Beleg festschreiben (unveränderbar) + revisionssicher archivieren.
  const finalize = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      const finalized = await finalizeDocument(id);
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      // Kurz warten, damit die Druckansicht die neue Nummer zeigt.
      await new Promise((r) => setTimeout(r, 400));
      const bytes = await buildDocumentPdfBytes(await buildPdfData(finalized.number));
      await archiveDocumentPdf({ id, number: finalized.number }, bytes);
      return finalized.number;
    },
    onSuccess: (number) => {
      toast.success(`Festgeschrieben und archiviert: ${number}`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { storno } = useDocumentCancellation({
    id,
    navigate,
    queryClient,
    setStornoOpen,
    setStornoReason,
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (isLockedDocument(docRecord)) throw new Error(deleteBlockedMessage(docRecord));
      // Verweise anderer Belege lösen, damit der Entwurf gelöscht werden kann
      await supabase
        .from("documents")
        .update({ converted_document_id: null })
        .eq("converted_document_id", id);
      await supabase
        .from("documents")
        .update({ cancels_document_id: null })
        .eq("cancels_document_id", id);
      await supabase
        .from("documents")
        .update({ cancelled_by_document_id: null })
        .eq("cancelled_by_document_id", id);
      await supabase
        .from("recurring_invoices")
        .update({ template_document_id: null })
        .eq("template_document_id", id);
      const { error } = await supabase.rpc("trash_entity", { _entity: "document", _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("In den Papierkorb verschoben – 30 Tage wiederherstellbar");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      navigate({ to: "/dokumente" });
    },
    onError: (e: unknown) => toast.error(describeGobdError(e, docRecord), { duration: 9000 }),
  });

  const { markPaid, reminder, unmarkPaid } = useDocumentPayments({ id, queryClient, setForm });

  // Manuelle Statuspflege ohne erneuten E-Mail-Versand.
  const setSendStatus = useMutation({
    mutationFn: async (next: "draft" | "sent") => {
      const { data, error } = await supabase
        .from("documents")
        .update({
          status: next,
          sent_at: next === "sent" ? new Date().toISOString() : null,
        } as never)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Beleg nicht gefunden");
      // Versand = echter Beleg: offizielle, fortlaufende Nummer vergeben.
      if (next === "sent") await ensureOfficialNumber(id);
      await logAudit(
        next === "sent" ? "marked_sent" : "marked_draft",
        { id, number: docNumber },
        {},
      );
      return next;
    },
    onSuccess: (next) => {
      setForm((f) => ({ ...f, status: next }));
      toast.success(
        next === "sent"
          ? "Status auf Versendet gesetzt – ohne erneute E-Mail an den Kunden."
          : "Status auf Entwurf zurückgesetzt.",
      );
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const { convert, decide, preparePlanning, quoteToInvoice } = useDocumentDetailWorkflow({
    data,
    form,
    id,
    navigate,
    queryClient,
    save,
    setForm,
  });

  if (isLoading || !data) {
    return null;
  }

  const {
    applyIssueMonth,
    assignOfficialNumberNow,
    canMahnen,
    cancelledBy,
    convertedId,
    dateCheck,
    doc,
    docNumber,
    docRecord,
    due,
    eRechnungInput,
    emailPending,
    epc,
    followUpDoc,
    introText,
    isInvoice,
    isOrder,
    isQuote,
    isStorno,
    locked,
    lockedAt,
    mail,
    paymentTermsDays,
    pickCustomer,
    plannedHoursMonth,
    plannedVisitsMonth,
    reminderLevel,
    senderLine,
    setField,
    settings,
    sourceDoc,
    stornoGrund,
    stornoNumber,
    updateItem,
    warnIfIncomplete,
  } = useDocumentViewData({
    data,
    form,
    grossTotal,
    id,
    items,
    netTotal,
    queryClient,
    reverseChargeAllowed,
    setForm,
    setItems,
    setQuoteRecipientMode,
    vatAmount,
    vatRate,
  });

  async function exportXRechnung() {
    try {
      if (!ensureHasItems()) return;
      if (!(await persistBeforeOutput())) return;
      const number = await assignOfficialNumberNow();
      const input = eRechnungInput(number);
      warnIfIncomplete(input, "xrechnung");
      downloadXml(buildXRechnungXml(input), `XRechnung_${number.replace(/\W+/g, "_")}.xml`);
      await logAudit("xrechnung_export", { id, number }, { format: "XRechnung 3.0 (UBL)" });
      toast.success("XRechnung (XML) erstellt");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Alle Belegdaten für die bibliotheksbasierte PDF-Erzeugung (pdf-lib) sammeln. */
  const { buildPdfData, ensureHasItems, persistBeforeOutput } = useDocumentPdfData({
    cancelledBy,
    discountAmount,
    discountPercent,
    discountReason,
    doc,
    docNumber,
    epc,
    form,
    grossTotal,
    hasOptionalItems,
    introText,
    isInvoice,
    isOrder,
    isPrivat,
    isQuote,
    isStorno,
    items,
    itemsTotal,
    locked,
    logoSrc,
    netTotal,
    paymentTermsDays,
    regularTotal,
    save,
    senderLine,
    settings,
    sourceDoc,
    stornoGrund,
    stornoNumber,
    taxNote,
    vatAmount,
    vatRate,
  });

  const { downloadPdf, exportZugferd, makePdfBytes } = useDocumentOutput({
    assignOfficialNumberNow,
    buildPdfData,
    doc,
    docNumber,
    eRechnungInput,
    ensureHasItems,
    id,
    persistBeforeOutput,
    warnIfIncomplete,
  });

  return {
    applyIssueMonth,
    assignOfficialNumberNow,
    autoSavedAt,
    canMahnen,
    cancelledBy,
    confirmDialog,
    convert,
    convertedId,
    data,
    dateCheck,
    decide,
    discountAmount,
    discountItemPresent,
    discountPercent,
    discountReason,
    doc,
    docNumber,
    docRecord,
    downloadPdf,
    due,
    duplicate,
    editMode,
    emailPending,
    ensureHasItems,
    epc,
    exportXRechnung,
    exportZugferd,
    finalize,
    followUpDoc,
    form,
    grossTotal,
    hasOptionalItems,
    id,
    introText,
    isInvoice,
    isOrder,
    isPrivat,
    isQuote,
    isSmallBusiness,
    isStorno,
    items,
    itemsTotal,
    locked,
    lockedAt,
    logoSrc,
    mail,
    mailOpen,
    makePdfBytes,
    markPaid,
    netTotal,
    payDate,
    payOpen,
    paymentTermsDays,
    persistBeforeOutput,
    pickCustomer,
    plannedHoursMonth,
    plannedVisitsMonth,
    preparePlanning,
    queryClient,
    quoteRecipientMode,
    quoteToInvoice,
    regularTotal,
    reminder,
    reminderLevel,
    remove,
    reverseChargeAllowed,
    save,
    senderLine,
    setConfirmDialog,
    setEditMode,
    setField,
    setForm,
    setItems,
    setMailOpen,
    setPayDate,
    setPayOpen,
    setQuoteRecipientMode,
    setSendStatus,
    setStornoOpen,
    setStornoReason,
    settings,
    sourceDoc,
    storno,
    stornoGrund,
    stornoNumber,
    stornoOpen,
    stornoReason,
    taxMode,
    taxNote,
    unmarkPaid,
    updateItem,
    vatAmount,
    vatRate,
  };
}

export type DocumentDetailStateContext = NonNullable<ReturnType<typeof useDocumentDetailState>>;
