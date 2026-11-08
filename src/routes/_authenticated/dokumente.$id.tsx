import { ChevronDown, Menu } from "lucide-react";
import { SupplementPanel } from "@/components/documents/SupplementPanel";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { DocumentConfirmDialog } from "@/components/documents/DocumentConfirmDialog";
import { DocumentPaymentDialog } from "@/components/documents/DocumentPaymentDialog";
import { DocumentCancellationDialog } from "@/components/documents/DocumentCancellationDialog";
import { DocumentStatusNotices } from "@/components/documents/DocumentStatusNotices";
import { parseGermanDate } from "@/lib/format";
import { useDocumentDetailState } from "@/components/documents/detail/useDocumentDetailState";
import { DocumentEmail } from "@/components/documents/detail/DocumentEmail";
import { DocumentPreview } from "@/components/documents/detail/DocumentPreview";
import { DocumentEditor } from "@/components/documents/detail/DocumentEditor";
import { DocumentWorkflow } from "@/components/documents/detail/DocumentWorkflow";
import { DocumentHeader } from "@/components/documents/detail/DocumentHeader";
import { MonthlyDeliveryNotePanel } from "@/components/documents/MonthlyDeliveryNotePanel";

export const Route = createFileRoute("/_authenticated/dokumente/$id")({
  validateSearch: (search: Record<string, unknown>): { bearbeiten?: boolean } =>
    search["bearbeiten"] === true || search["bearbeiten"] === "1" ? { bearbeiten: true } : {},

  head: () => ({
    meta: [
      { title: "Beleg-Vorschau – Rechnungen & Angebote" },
      {
        name: "description",
        content:
          "Fertiges Dokument als saubere A4-Vorschau ansehen, als PDF herunterladen, drucken oder per E-Mail senden.",
      },
      { property: "og:title", content: "Beleg-Vorschau" },
      { property: "og:description", content: "Rechnung oder Angebot ansehen, drucken und senden." },
    ],
  }),
  component: DokumentDetail,
});

function DokumentDetail() {
  const state = useDocumentDetailState();
  if (!state) return <p className="text-muted-foreground">Wird geladen…</p>;

  const {
    cancelledBy,
    confirmDialog,
    doc,
    docRecord,
    due,
    emailPending,
    followUpDoc,
    isInvoice,
    isStorno,
    locked,
    lockedAt,
    markPaid,
    payDate,
    payOpen,
    reminderLevel,
    setConfirmDialog,
    setPayDate,
    setPayOpen,
    setStornoOpen,
    setStornoReason,
    sourceDoc,
    storno,
    stornoGrund,
    stornoNumber,
    stornoOpen,
    stornoReason,
  } = state;
  return (
    <div className="space-y-6">
      {state.isQuote ? (
        <>
          <div className="no-print flex flex-wrap items-start justify-between gap-3">
            <details className="group w-full sm:max-w-md">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                <Menu className="size-4" /> Aktionen
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-3 rounded-lg border bg-background p-3 [&_button]:w-full [&_button]:justify-start [&_a]:w-full [&_.flex-wrap]:w-full">
                <DocumentHeader state={state} />
                <DocumentWorkflow state={state} showSupplement={false} />
              </div>
            </details>
            {!state.locked && state.editMode && (
              <p className="text-xs text-muted-foreground" role="status">
                {state.autoSavedAt ? `Automatisch gespeichert um ${state.autoSavedAt} Uhr` : "Änderungen werden automatisch gespeichert"}
              </p>
            )}
          </div>
          <SupplementPanel state={state} />
        </>
      ) : (
        <>
          <DocumentHeader state={state} />
          <DocumentWorkflow state={state} />
        </>
      )}

      <DocumentCancellationDialog
        open={stornoOpen}
        reason={stornoReason}
        pending={storno.isPending}
        onClose={() => setStornoOpen(false)}
        onReasonChange={setStornoReason}
        onConfirm={() => storno.mutate(stornoReason)}
      />

      <DocumentStatusNotices
        emailPending={emailPending}
        locked={locked}
        isInvoice={isInvoice}
        status={doc.status}
        lockedAt={lockedAt}
        archivedAt={docRecord["archived_at"]}
        pdfSha256={docRecord["pdf_sha256"]}
        cancelledBy={cancelledBy}
        stornoNumber={stornoNumber}
        isStorno={isStorno}
        stornoGrund={stornoGrund}
        followUpDoc={followUpDoc}
        sourceDoc={sourceDoc}
        due={due}
        reminderLevel={reminderLevel}
        lastReminderAt={docRecord["last_reminder_at"]}
      />

      <DocumentEditor state={state} />
      <MonthlyDeliveryNotePanel state={state} />
      <DocumentPreview state={state} />

      <DocumentEmail state={state} />

      <DocumentPaymentDialog
        open={payOpen}
        value={payDate}
        pending={markPaid.isPending}
        onOpenChange={setPayOpen}
        onValueChange={setPayDate}
        onConfirm={() => {
          const iso = parseGermanDate(payDate);
          if (!iso) {
            toast.error("Bitte das Datum im Format TT.MM.JJJJ eingeben.");
            return;
          }
          markPaid.mutate(iso);
          setPayOpen(false);
        }}
      />

      <DocumentConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}
