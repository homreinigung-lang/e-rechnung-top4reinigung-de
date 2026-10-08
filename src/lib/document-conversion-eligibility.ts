export type ConversionSource = {
  type: string;
  status: string;
  is_storno?: boolean | null;
  deleted_at?: string | null;
  converted_document_id?: string | null;
};

/** Validate source eligibility before creating a follow-up document. */
export function assertDocumentConversionAllowed(source: ConversionSource, target: "order" | "invoice") {
  if (target === "order" ? source.type !== "quote" : !["quote", "order"].includes(source.type)) {
    throw new Error("Dieser Belegtyp kann nicht in das gewünschte Dokument umgewandelt werden.");
  }
  if (source.is_storno || source.status === "cancelled" || source.deleted_at) {
    throw new Error("Stornierte oder gelöschte Belege können nicht umgewandelt werden.");
  }
  if (source.type === "quote" && source.status !== "accepted") {
    throw new Error("Nur angenommene Angebote können umgewandelt werden.");
  }
  if (source.type === "order" && !["draft", "sent"].includes(source.status)) {
    throw new Error("Nur offene Auftragsbestätigungen können umgewandelt werden.");
  }
  if (source.converted_document_id) {
    throw new Error("Dieser Beleg wurde bereits umgewandelt.");
  }
}
