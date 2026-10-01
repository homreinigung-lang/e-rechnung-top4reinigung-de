import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, FileDown, Mail, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type DocumentHeaderActionsProps = {
  status: string;
  locked: boolean;
  editMode: boolean;
  sendPending: boolean;
  savePending: boolean;
  onDownloadPdf: () => void;
  onSendEmail: () => void;
  onMarkSent: () => void;
  onResetDraft: () => void;
  onToggleEdit: () => void;
};

export function DocumentHeaderActions({
  status,
  locked,
  editMode,
  sendPending,
  savePending,
  onDownloadPdf,
  onSendEmail,
  onMarkSent,
  onResetDraft,
  onToggleEdit,
}: DocumentHeaderActionsProps) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <Button asChild variant="ghost" size="sm">
        <Link to="/dokumente">
          <ArrowLeft className="size-4" /> Zurück
        </Link>
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onDownloadPdf}>
          <FileDown className="size-4" /> PDF herunterladen
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Drucken
        </Button>
        <Button variant="outline" onClick={onSendEmail}>
          <Mail className="size-4" /> Per E-Mail senden
        </Button>
        {status === "draft" && !locked && (
          <Button
            variant="outline"
            title="Beleg als versendet kennzeichnen, ohne eine E-Mail zu verschicken"
            onClick={onMarkSent}
            disabled={sendPending || savePending}
          >
            <Check className="size-4" /> Als versendet markieren
          </Button>
        )}
        {status === "sent" && !locked && (
          <Button
            variant="ghost"
            title="Status zurück auf Entwurf setzen"
            onClick={onResetDraft}
            disabled={sendPending}
          >
            Zurück auf Entwurf
          </Button>
        )}
        {!locked && (
          <Button variant={editMode ? "secondary" : "default"} onClick={onToggleEdit}>
            <Pencil className="size-4" /> {editMode ? "Vorschau" : "Bearbeiten"}
          </Button>
        )}
      </div>
    </div>
  );
}
