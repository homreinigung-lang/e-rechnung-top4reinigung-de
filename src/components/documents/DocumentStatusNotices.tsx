import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { DOC_TYPE_LABEL, formatDate } from "@/lib/format";
import { mahnLabel } from "@/lib/workflow";

type RelatedDocument = {
  id: string;
  number: string | null;
  type: string;
};

type DocumentStatusNoticesProps = {
  emailPending: boolean;
  locked: boolean;
  isInvoice: boolean;
  status: string;
  lockedAt: string | null;
  archivedAt: unknown;
  pdfSha256: unknown;
  cancelledBy: unknown;
  stornoNumber: string;
  isStorno: boolean;
  stornoGrund: string;
  followUpDoc: RelatedDocument | null;
  sourceDoc: RelatedDocument | null;
  due: { overdue?: boolean; label?: string } | null;
  reminderLevel: number;
  lastReminderAt: unknown;
};

export function DocumentStatusNotices({
  emailPending,
  locked,
  isInvoice,
  status,
  lockedAt,
  archivedAt,
  pdfSha256,
  cancelledBy,
  stornoNumber,
  isStorno,
  stornoGrund,
  followUpDoc,
  sourceDoc,
  due,
  reminderLevel,
  lastReminderAt,
}: DocumentStatusNoticesProps) {
  return (
    <>
      {emailPending && (
        <div role="alert" className="no-print rounded-lg border border-amber-500/60 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Versand ausstehend:</strong> Die Rechnung ist festgeschrieben, aber ein erfolgreicher E-Mail-Versand ist nicht bestätigt. Bitte den Versandstatus prüfen und bei Bedarf über „Per E-Mail senden“ mit der archivierten Original-PDF erneut senden.
        </div>
      )}
      {locked && isInvoice && status === "draft" && (
        <div className="no-print rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm" role="status">
          <p className="font-semibold">Versand ausstehend – Rechnung bereits festgeschrieben</p>
          <p>Die Rechnung ist nicht mehr bearbeitbar. Bitte über „Per E-Mail senden“ mit derselben Rechnungsnummer und dem geprüften Archiv-PDF erneut senden. Bei unklarem E-Mail-Ergebnis zuerst den tatsächlichen Versand prüfen.</p>
        </div>
      )}
      {locked && lockedAt && (
        <div className="no-print flex flex-wrap items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Festgeschrieben – GoBD-konform unveränderbar</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${archivedAt || pdfSha256 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {archivedAt || pdfSha256 ? "GoBD-Archiviert" : "PDF-Archivierung ausstehend"}
              </span>
            </div>
            <p className="text-muted-foreground">
              Festgeschrieben am {formatDate(lockedAt)}
              {archivedAt ? ` · GoBD-Archiviert am ${formatDate(String(archivedAt))}` : ""}
              {pdfSha256 ? ` · Archiv-Prüfsumme (SHA-256): ${String(pdfSha256).slice(0, 16)}…` : ""}
              {cancelledBy ? ` · Diese Rechnung wurde storniert${stornoNumber ? ` durch ${stornoNumber}` : ""}.` : ""}
              {isStorno ? ` · Stornorechnung${stornoNumber ? ` zu ${stornoNumber}` : ""}` : ""}
              {stornoGrund ? ` · Stornogrund: ${stornoGrund}` : ""}
            </p>
            <p className="font-medium text-destructive">
              Löschen und Überschreiben sind für diesen Beleg gesperrt. Korrekturen ausschließlich per Stornorechnung.
            </p>
          </div>
        </div>
      )}
      {(followUpDoc || sourceDoc) && (
        <div className="no-print rounded-lg border border-border bg-muted/40 p-4 text-sm">
          {followUpDoc && (
            <p>
              {followUpDoc.type === "invoice" ? "Für diesen Beleg wurde bereits eine Rechnung erstellt: " : "Folgebeleg erstellt: "}
              <Link to="/dokumente/$id" params={{ id: followUpDoc.id }} className="font-medium underline">
                {followUpDoc.number}
              </Link>
            </p>
          )}
          {sourceDoc && (
            <p>
              Erstellt aus {sourceDoc.type === "quote" ? "Angebot" : DOC_TYPE_LABEL[sourceDoc.type] ?? "Beleg"}{" "}
              <Link to="/dokumente/$id" params={{ id: sourceDoc.id }} className="font-medium underline">
                {sourceDoc.number}
              </Link>
            </p>
          )}
        </div>
      )}
      {(due || reminderLevel > 0) && (
        <div className={`no-print rounded-lg border p-4 text-sm ${due?.overdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`}>
          <span className={due?.overdue ? "font-medium text-destructive" : "font-medium"}>
            {due?.label ?? "Offener Posten"}
          </span>
          {reminderLevel > 0 && (
            <span className="text-muted-foreground">
              {" "}· {mahnLabel(reminderLevel)}
              {lastReminderAt ? ` vom ${formatDate(String(lastReminderAt))}` : ""}
            </span>
          )}
        </div>
      )}
    </>
  );
}
