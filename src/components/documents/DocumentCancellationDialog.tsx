import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DocumentCancellationDialogProps = {
  open: boolean;
  reason: string;
  pending: boolean;
  onClose: () => void;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
};

export function DocumentCancellationDialog({
  open,
  reason,
  pending,
  onClose,
  onReasonChange,
  onConfirm,
}: DocumentCancellationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stornorechnung erstellen</DialogTitle>
          <DialogDescription>
            Es wird ein neuer Beleg mit eigener fortlaufender Nummer und negativen Beträgen
            erzeugt. Der Stornogrund wird revisionssicher gespeichert und auf dem Storno-Beleg
            gedruckt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="storno-reason">Stornogrund (Pflichtangabe)</Label>
          <Textarea
            id="storno-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="z. B. Falscher Leistungszeitraum, Kunde storniert, fehlerhafte Positionen …"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending || reason.trim().length < 3}
          >
            Storno erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
