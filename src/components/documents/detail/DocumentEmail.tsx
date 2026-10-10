import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DOC_TYPE_LABEL } from "@/lib/format";
import { SendEmailDialog } from "@/components/SendEmailDialog";
import { logAudit } from "@/lib/gobd";
import { ensureOfficialNumber } from "@/lib/doc-number";
import type { DocumentDetailStateContext } from "./useDocumentDetailState";

export function DocumentEmail({ state }: { state: DocumentDetailStateContext }) {
  const {
    doc,
    docNumber,
    id,
    isInvoice,
    locked,
    mail,
    mailOpen,
    makePdfBytes,
    queryClient,
    setField,
    setMailOpen,
    settings,
  } = state;
  return (
    <SendEmailDialog
      open={mailOpen}
      documentId={id}
      onOpenChange={setMailOpen}
      defaults={{
        to: mail.to,
        subject: mail.subject,
        body: mail.body,
        signatureText: mail.signatureText,
        signatureHtml: mail.signatureHtml,
        fileBaseName: `${DOC_TYPE_LABEL[doc.type]}-${docNumber}`,
        companyName: String(settings?.["company_name"] ?? ""),
        companyEmail: String(settings?.["email"] ?? ""),
      }}
      buildPdfBytes={makePdfBytes}
      beforeSend={async (generatedBytes) => {
        if (!isInvoice) return generatedBytes;
        const { prepareInvoiceForEmail } = await import("@/lib/invoice-send");
        const bytes = await prepareInvoiceForEmail(id, docNumber, generatedBytes);
        await queryClient.invalidateQueries({ queryKey: ["document", id] });
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
        return bytes;
      }}
      onSent={async () => {
        // Versand-Status verbindlich in der Datenbank setzen (auch für Angebote),
        // damit der Beleg in der Übersicht als "Versendet" erscheint.
        const { data: updated, error: sendError } = await supabase
          .from("documents")
          .update({ status: "sent", sent_at: new Date().toISOString() } as never)
          .eq("id", id)
          .select("id, status")
          .maybeSingle();
        if (sendError || !updated) {
          throw new Error(
            `E-Mail versendet, aber Versandstatus nicht gespeichert: ${sendError?.message ?? "Beleg nicht gefunden"}. Bitte vor erneutem Senden den Versand prüfen.`,
          );
        }
        setField("status", "sent");
        try {
          await logAudit("sent", { id, number: docNumber }, { to: mail.to });
        } catch {
          /* Protokollierung darf den Versand nicht blockieren */
        }
        // Entwurfsnummer (DEMO) beim Versand durch die offizielle Nummer ersetzen.
        if (!locked) {
          try {
            await ensureOfficialNumber(id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["document", id] });
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
        await queryClient.refetchQueries({ queryKey: ["documents"] });
      }}
    />
  );
}
