import { supabase } from "@/integrations/supabase/client";
import { archiveDocumentPdf, finalizeDocument } from "./gobd";

/** Verify the original archive and official number before contacting the mail provider. */
export async function prepareInvoiceForEmail(
  id: string,
  docNumber: string,
  generatedBytes: Uint8Array,
): Promise<Uint8Array> {
  const { data: live, error: readError } = await supabase
    .from("documents")
    .select("id,number,locked_at,pdf_path,pdf_sha256,archived_at")
    .eq("id", id)
    .single();
  if (readError || !live) throw readError ?? new Error("GoBD: Rechnung nicht gefunden.");
  if (live.number !== docNumber) {
    throw new Error(
      "GoBD: Rechnungsnummer hat sich geändert. Bitte Seite neu laden und erneut senden.",
    );
  }
  // Retry after a failed email uses the actual verified original, not a newly rendered PDF.
  if (live.pdf_path && live.pdf_sha256 && live.archived_at) {
    const { FILES_BUCKET } = await import("@/lib/storage");
    const { sha256Hex } = await import("@/lib/gobd");
    const { data: archived, error: downloadError } = await supabase.storage
      .from(FILES_BUCKET)
      .download(live.pdf_path);
    if (downloadError || !archived) {
      throw downloadError ?? new Error("GoBD: Archiv-PDF fehlt. E-Mail wurde nicht gesendet.");
    }
    const originalBytes = new Uint8Array(await archived.arrayBuffer());
    if (
      originalBytes.length < 5 ||
      new TextDecoder().decode(originalBytes.subarray(0, 5)) !== "%PDF-" ||
      (await sha256Hex(originalBytes)) !== live.pdf_sha256.toLowerCase()
    ) {
      throw new Error(
        "GoBD: Archiv-PDF ist beschädigt oder Prüfsumme weicht ab. Kein E-Mail-Versand.",
      );
    }
    return originalBytes;
  }
  if (live.locked_at) {
    throw new Error(
      "GoBD: Bereits festgeschriebene Rechnung ohne vollständiges Archiv. Original-PDF zuerst wiederherstellen; kein neuer PDF-Ersatz und kein Versand.",
    );
  }
  // Preserve the PDF bytes produced from the final draft; lock, then archive and verify.
  const finalized = await finalizeDocument(id);
  if (finalized.number !== docNumber) {
    throw new Error("GoBD: Rechnungsnummer bei Festschreibung geändert. Kein E-Mail-Versand.");
  }
  // The finalization RPC temporarily marks a draft as "sent". That does NOT
  // mean an email has been sent. Keep it locked, but visibly pending, until
  // the email provider confirms delivery acceptance below.
  let archiveFailure: unknown = null;
  try {
    await archiveDocumentPdf({ id, number: finalized.number }, generatedBytes);
  } catch (error) {
    archiveFailure = error;
  }
  const { data: pending, error: pendingError } = await supabase
    .from("documents")
    .update({ status: "draft", sent_at: null } as never)
    .eq("id", id)
    .eq("number", finalized.number)
    .eq("status", "sent")
    .is("sent_at", null)
    .select("id")
    .single();
  if (pendingError || !pending) {
    throw (
      pendingError ??
      new Error(
        "GoBD: Versandstatus konnte nicht als ausstehend gespeichert werden. Keine E-Mail gesendet.",
      )
    );
  }
  if (archiveFailure) throw archiveFailure;
  return generatedBytes;
}
