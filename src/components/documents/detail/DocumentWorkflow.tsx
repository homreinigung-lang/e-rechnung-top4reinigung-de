import { formatDate, today } from "@/lib/format";
import { DocumentWorkflowActions } from "@/components/documents/DocumentWorkflowActions";
import { mahnLabel } from "@/lib/workflow";
import type { DocumentDetailStateContext } from "./useDocumentDetailState";

export function DocumentWorkflow({ state }: { state: DocumentDetailStateContext }) {
  const {
    autoSavedAt,
    canMahnen,
    cancelledBy,
    convert,
    convertedId,
    decide,
    doc,
    duplicate,
    editMode,
    exportXRechnung,
    exportZugferd,
    form,
    isInvoice,
    isOrder,
    isQuote,
    isStorno,
    locked,
    markPaid,
    plannedHoursMonth,
    plannedVisitsMonth,
    preparePlanning,
    quoteToInvoice,
    reminder,
    reminderLevel,
    remove,
    save,
    setConfirmDialog,
    setPayDate,
    setPayOpen,
    setStornoOpen,
    storno,
    unmarkPaid,
  } = state;
  return (
    <DocumentWorkflowActions
      editMode={editMode}
      isInvoice={isInvoice}
      isStorno={isStorno}
      isQuote={isQuote}
      isOrder={isOrder}
      locked={locked}
      status={doc.status}
      paidAt={String(form["paid_at"] ?? "")}
      convertedId={convertedId}
      projectId={form["project_id"]}
      documentNumber={doc.number ?? ""}
      autoSavedAt={autoSavedAt}
      reminderLevel={reminderLevel}
      canMahnen={canMahnen}
      plannedHoursMonth={plannedHoursMonth}
      plannedVisitsMonth={plannedVisitsMonth}
      duplicatePending={duplicate.isPending}
      markPaidPending={markPaid.isPending}
      unmarkPaidPending={unmarkPaid.isPending}
      reminderPending={reminder.isPending}
      planningPending={preparePlanning.isPending}
      convertPending={convert.isPending}
      quoteToInvoicePending={quoteToInvoice.isPending}
      removePending={remove.isPending}
      savePending={save.isPending}
      stornoPending={storno.isPending}
      cancelledBy={cancelledBy}
      onDuplicate={() => duplicate.mutate()}
      onExportXRechnung={() => void exportXRechnung()}
      onExportZugferd={() => void exportZugferd()}
      onOpenPayment={() => {
        setPayDate(formatDate(String(form["paid_at"] ?? today())));
        setPayOpen(true);
      }}
      onUnmarkPaid={() =>
        setConfirmDialog({
          title: "Zahlung zurücknehmen",
          description: "Die Rechnung gilt danach wieder als offen.",
          confirmLabel: "Zurücknehmen",
          action: () => unmarkPaid.mutate(),
        })
      }
      onReminder={() =>
        setConfirmDialog({
          title: "Zahlungserinnerung senden",
          description: "Freundliche Zahlungserinnerung jetzt erfassen und versenden?",
          confirmLabel: "Jetzt senden",
          action: () => reminder.mutate("erinnerung"),
        })
      }
      onMahnung={() =>
        setConfirmDialog({
          title: `${mahnLabel(Math.max(2, reminderLevel + 1))} senden`,
          description: "Dieser Schritt wird GoBD-konform protokolliert. Jetzt offiziell mahnen?",
          confirmLabel: "Jetzt senden",
          action: () => reminder.mutate("mahnung"),
        })
      }
      onAcceptQuote={() => decide.mutate("accepted")}
      onDeclineQuote={() => decide.mutate("declined")}
      onPreparePlanning={() => preparePlanning.mutate()}
      onConvert={() => convert.mutate()}
      onQuoteToInvoice={() => quoteToInvoice.mutate()}
      onRemoveOrder={() =>
        setConfirmDialog({
          title: "Auftragsbestätigung löschen?",
          description: `„${doc.number ?? ""}" wird in den Papierkorb verschoben und kann dort 30 Tage lang wiederhergestellt werden.`,
          confirmLabel: "In Papierkorb verschieben",
          destructive: true,
          action: () => remove.mutate(),
        })
      }
      onSave={() => save.mutate()}
      onOpenStorno={() => setStornoOpen(true)}
      formatDate={formatDate}
      mahnLabel={mahnLabel}
    />
  );
}
