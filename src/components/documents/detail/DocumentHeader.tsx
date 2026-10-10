import { toast } from "sonner";
import { DocumentHeaderActions } from "@/components/documents/DocumentHeaderActions";
import { ensureOfficialNumber } from "@/lib/doc-number";
import type { DocumentDetailStateContext } from "./useDocumentDetailState";

export function DocumentHeader({ state }: { state: DocumentDetailStateContext }) {
  const {
    assignOfficialNumberNow,
    doc,
    downloadPdf,
    editMode,
    ensureHasItems,
    finalize,
    id,
    isInvoice,
    locked,
    persistBeforeOutput,
    queryClient,
    save,
    setEditMode,
    setMailOpen,
    setSendStatus,
  } = state;
  return (
    <DocumentHeaderActions
      status={doc.status}
      locked={locked}
      editMode={editMode}
      sendPending={setSendStatus.isPending}
      savePending={save.isPending}
      onDownloadPdf={() => void downloadPdf()}
      onSendEmail={() => {
        void (async () => {
          if (!ensureHasItems()) return;
          if (!(await persistBeforeOutput())) return;
          try {
            await assignOfficialNumberNow();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
            return;
          }
          setMailOpen(true);
        })();
      }}
      onMarkSent={() => {
        void (async () => {
          if (!ensureHasItems()) return;
          if (!(await persistBeforeOutput())) return;
          await setSendStatus.mutateAsync("sent");
          try {
            await ensureOfficialNumber(id);
            await queryClient.invalidateQueries({ queryKey: ["document", id] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
          }
          if (isInvoice) {
            try {
              await finalize.mutateAsync();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Festschreiben fehlgeschlagen");
            }
          }
        })();
      }}
      onResetDraft={() => setSendStatus.mutate("draft")}
      onToggleEdit={() => setEditMode((value) => !value)}
    />
  );
}
