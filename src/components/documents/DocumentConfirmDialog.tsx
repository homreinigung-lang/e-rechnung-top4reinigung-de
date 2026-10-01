import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DocumentConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => void;
};

type DocumentConfirmDialogProps = {
  dialog: DocumentConfirmDialogState | null;
  onClose: () => void;
};

export function DocumentConfirmDialog({ dialog, onClose }: DocumentConfirmDialogProps) {
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialog?.title}</DialogTitle>
          <DialogDescription>{dialog?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant={dialog?.destructive ? "destructive" : "default"}
            onClick={() => {
              dialog?.action();
              onClose();
            }}
          >
            {dialog?.confirmLabel ?? "Bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
