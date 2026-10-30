import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/auth-user";
import { FILES_BUCKET, fetchStoredBlob } from "@/lib/storage";
import {
  assertDeliveryNoteComplete,
  deliveryNoteSchema,
  type DeliveryNote,
  type DeliveryNoteRecord,
  type ProjectDeliveryNoteRecord,
} from "./delivery-note";

export async function fetchDeliveryNote(
  documentId: string,
  allowMissingTable = false,
): Promise<DeliveryNoteRecord | null> {
  const { data, error } = await supabase
    .from("document_delivery_notes")
    .select("document_id,data,scan_path,version,source_note_id")
    .eq("document_id", documentId)
    .maybeSingle();
  // Existing invoices continue to work while the additive migration is being deployed.
  if (error && allowMissingTable && ["42P01", "PGRST205"].includes(error.code)) return null;
  if (error) throw new Error(`Lieferschein konnte nicht geladen werden: ${error.message}`);
  if (!data) return null;
  return { ...data, data: deliveryNoteSchema.parse(data.data) };
}

export async function fetchProjectDeliveryNotes(
  projectId: string,
): Promise<ProjectDeliveryNoteRecord[]> {
  const { data, error } = await supabase
    .from("project_delivery_notes")
    .select("id,project_id,data,scan_path,version")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Objekt-Lieferscheine konnten nicht geladen werden: ${error.message}`);
  if (!data?.length) return [];
  const { data: links, error: linkError } = await supabase
    .from("document_delivery_notes")
    .select("source_note_id,document_id")
    .in(
      "source_note_id",
      data.map((n) => n.id),
    );
  if (linkError) throw linkError;
  const ids = (links ?? []).map((n) => n.document_id);
  const invoices = ids.length
    ? await supabase.from("documents").select("id,number").in("id", ids)
    : { data: [], error: null };
  if (invoices.error) throw invoices.error;
  return data.map((n) => {
    const link = links?.find((l) => l.source_note_id === n.id);
    return {
      ...n,
      data: deliveryNoteSchema.parse(n.data),
      document_id: link?.document_id ?? "",
      invoice_number: invoices.data?.find((d) => d.id === link?.document_id)?.number,
    };
  });
}

export async function saveProjectDeliveryNote(
  id: string,
  projectId: string,
  note: DeliveryNote,
  scanPath: string | null,
  version: number | null,
) {
  const payload = {
    data: deliveryNoteSchema.parse(note) as unknown as import("@/integrations/supabase/types").Json,
    scan_path: scanPath,
  };
  const q =
    version === null
      ? supabase
          .from("project_delivery_notes")
          .insert({ ...payload, id, project_id: projectId, user_id: await requireUserId() })
      : supabase.from("project_delivery_notes").update(payload).eq("id", id).eq("version", version);
  const { data, error } = await q.select("version").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lieferschein wurde zwischenzeitlich geändert. Bitte neu öffnen.");
  return data.version;
}

export async function removeProjectDeliveryNote(id: string, version: number) {
  const { data, error } = await supabase
    .from("project_delivery_notes")
    .delete()
    .eq("id", id)
    .eq("version", version)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lieferschein wurde geändert. Bitte neu öffnen.");
}

export async function attachProjectDeliveryNote(
  note: ProjectDeliveryNoteRecord,
  invoiceId: string,
) {
  assertDeliveryNoteComplete(note.data, Boolean(note.scan_path));
  const { error } = await supabase.rpc("attach_project_delivery_note", {
    _note_id: note.id,
    _document_id: invoiceId,
    _version: note.version,
  });
  if (error) throw error;
}

export async function saveDeliveryNote(
  documentId: string,
  note: DeliveryNote,
  scanPath: string | null,
  version: number | null,
) {
  const data = deliveryNoteSchema.parse(note);
  const payload = {
    data: data as unknown as import("@/integrations/supabase/types").Json,
    scan_path: scanPath,
  };
  const query =
    version === null
      ? supabase
          .from("document_delivery_notes")
          .insert({ ...payload, document_id: documentId, user_id: await requireUserId() })
      : supabase
          .from("document_delivery_notes")
          .update(payload)
          .eq("document_id", documentId)
          .eq("version", version);
  const { data: saved, error } = await query.select("version").maybeSingle();
  if (error) throw error;
  if (!saved)
    throw new Error(
      "Der Lieferschein wurde zwischenzeitlich geändert. Bitte schließen und neu öffnen.",
    );
  return saved.version;
}

export async function assertSavedDeliveryNoteComplete(documentId: string) {
  const note = await fetchDeliveryNote(documentId, true);
  if (note) assertDeliveryNoteComplete(note.data, Boolean(note.scan_path));
  return note?.version ?? 0;
}

export async function removeDeliveryNote(documentId: string, version: number) {
  const { data, error } = await supabase
    .from("document_delivery_notes")
    .delete()
    .eq("document_id", documentId)
    .eq("version", version)
    .select("document_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lieferschein wurde geändert. Bitte neu laden.");
}

export async function deliveryScanBytes(path: string): Promise<Uint8Array> {
  const blob = await fetchStoredBlob(path);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Convert a phone photo to an A4 PDF; PDFs retain every scanned page. */
export async function uploadDeliveryScan(documentId: string, file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error("Bitte eine Datei bis 12 MB auswählen.");
  const { PDFDocument } = await import("pdf-lib");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  let pdfBytes: Uint8Array;
  if (isPdf) {
    const doc = await PDFDocument.load(bytes);
    if (doc.getPageCount() === 0) throw new Error("Das PDF enthält keine Seiten.");
    pdfBytes = bytes;
  } else {
    const doc = await PDFDocument.create();
    let image;
    try {
      image = await doc.embedJpg(bytes);
    } catch {
      try {
        image = await doc.embedPng(bytes);
      } catch {
        throw new Error(
          "Bitte PDF, JPG oder PNG hochladen. HEIC bitte zuerst als JPG oder PDF exportieren.",
        );
      }
    }
    const landscape = image.width > image.height;
    const page = doc.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
    const size = image.scaleToFit(page.getWidth() - 40, page.getHeight() - 40);
    page.drawImage(image, {
      x: (page.getWidth() - size.width) / 2,
      y: (page.getHeight() - size.height) / 2,
      ...size,
    });
    pdfBytes = await doc.save();
  }
  const path = `${await requireUserId()}/delivery-notes/${documentId}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return path;
}
