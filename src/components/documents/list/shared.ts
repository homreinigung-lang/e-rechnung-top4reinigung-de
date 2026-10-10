export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted/70 text-muted-foreground border-transparent",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  accepted: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  declined: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  paid: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
};

export type DocRow = {
  id: string;
  type: string;
  number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  customer_name: string;
  customer_company: string;
  total: number | string;
  converted_document_id: string | null;
  [key: string]: unknown;
};

export interface AngebotsTabelleProps {
  /** "quote" = Angebote, "order" = Auftragsbestätigungen. */
  kind: "quote" | "order";
  list: DocRow[];
  decide: {
    mutate: (v: { docId: string; decision: "accepted" | "declined" }) => void;
    isPending: boolean;
  };
  decline: (id: string, label: string) => void;
  convert: { mutate: (id: string) => void; isPending: boolean };
  /** Angebot bzw. Auftragsbestätigung direkt in eine Rechnung umwandeln. */
  toInvoice: { mutate: (id: string) => void; isPending: boolean };
  complete: { mutate: (id: string) => void; isPending: boolean };
  duplicate: { mutate: (id: string) => void };
  remove: { mutate: (id: string) => void };
  isLocked: (r: Record<string, unknown>) => boolean;
  /** Nachschlagewerk für den erzeugten Folgebeleg (Nummer + Typ). */
  followUp: (id: string) => { id: string; number: string; type: string } | null;
  /** Öffnet den gemeinsamen Lösch-Bestätigungsdialog (deleteTarget) aus DokumenteListe. */
  onDelete: (id: string, label: string) => void;
}
