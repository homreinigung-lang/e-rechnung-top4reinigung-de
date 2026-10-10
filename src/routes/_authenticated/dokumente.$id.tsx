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
      <DocumentHeader state={state} />

      <DocumentWorkflow state={state} />

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
