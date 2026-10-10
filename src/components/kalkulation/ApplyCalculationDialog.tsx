import { formatMoney } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { KalkulationStateContext } from "./useKalkulationState";

export function ApplyCalculationDialog({ state }: { state: KalkulationStateContext }) {
  const { pendingApply, setPendingApply, writeSource } = state;
  return (
    <AlertDialog open={pendingApply !== null} onOpenChange={(o) => !o && setPendingApply(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leistungsverzeichnis enthält andere Positionen</AlertDialogTitle>
          <AlertDialogDescription>
            Das Leistungsverzeichnis enthält bereits {pendingApply?.foreignCount} Position(en)
            anderer Herkunft ({formatMoney(pendingApply?.foreignTotal ?? 0)}). Sollen diese erhalten
            bleiben oder komplett durch „{pendingApply?.label}“ ersetzt werden?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (pendingApply) writeSource(pendingApply.section, pendingApply.items, true);
              setPendingApply(null);
            }}
          >
            LV komplett ersetzen
          </Button>
          <AlertDialogAction
            onClick={() => {
              if (pendingApply) writeSource(pendingApply.section, pendingApply.items, false);
              setPendingApply(null);
            }}
          >
            Nur diesen Bereich ersetzen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
