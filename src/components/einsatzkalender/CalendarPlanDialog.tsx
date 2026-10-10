import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarPlanDialog({ state }: { state: EinsatzKalenderStateContext }) {
  const { confirmPlan, planDetail, setPlanDetail } = state;
  return (
    <Dialog open={planDetail !== null} onOpenChange={(o) => !o && setPlanDetail(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan-Details</DialogTitle>
        </DialogHeader>
        {planDetail && (
          <div className="space-y-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded border border-dashed border-primary/50 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
              Geplanter Einsatz
            </span>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Datum</dt>
              <dd className="font-medium">{formatDate(planDetail.date)}</dd>
              <dt className="text-muted-foreground">Mitarbeiter</dt>
              <dd className="font-medium">{planDetail.employeeName}</dd>
              <dt className="text-muted-foreground">Objekt / Einsatzort</dt>
              <dd>{planDetail.projectName}</dd>
              <dt className="text-muted-foreground">Zeit</dt>
              <dd>
                {planDetail.range || "—"}
                {planDetail.breakMin ? ` (Pause ${planDetail.breakMin} Min.)` : ""}
              </dd>
              <dt className="text-muted-foreground">Planstunden</dt>
              <dd className="font-medium">{planDetail.hours.toFixed(2)} Std.</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              Mit „Erledigt bestätigen“ werden die Planzeiten als tatsächliche Arbeitszeit
              übernommen.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            size="sm"
            disabled={confirmPlan.isPending}
            onClick={() => planDetail && confirmPlan.mutate(planDetail)}
          >
            <Check className="size-4" /> Erledigt bestätigen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPlanDetail(null)}>
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
