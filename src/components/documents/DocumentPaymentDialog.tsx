import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DocumentPaymentDialogProps = {
  open: boolean;
  value: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
};

export function DocumentPaymentDialog({
  open,
  value,
  pending,
  onOpenChange,
  onValueChange,
  onConfirm,
}: DocumentPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Als bezahlt markieren</DialogTitle>
          <DialogDescription>Zahlungsdatum im Format TT.MM.JJJJ erfassen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="detail-pay-date">Zahlungsdatum</Label>
          <Input
            id="detail-pay-date"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="TT.MM.JJJJ"
            inputMode="numeric"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            Zahlung buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
