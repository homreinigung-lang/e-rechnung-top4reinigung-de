import { FileSignature } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney, formatNumber } from "@/lib/format";
import { computeDocumentTotals } from "@/lib/document-totals";
import { WORKFLOW_LABELS, type CalculationWorkflow } from "@/lib/calculation-transfer";
import type { KalkulationStateContext } from "./useKalkulationState";

export function CalculationTransfer({ state, workflow }: {
  state: KalkulationStateContext;
  workflow: CalculationWorkflow;
}) {
  const { transfer, transferConfirmed, setTransferConfirmed } = state;
  const totals = computeDocumentTotals(transfer.positions, 0, state.vatRate);
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Angebotsvorschau">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">In Angebot übernehmen</h2>
          <p className="text-xs text-muted-foreground">Quelle: {WORKFLOW_LABELS[workflow]}. Nur die folgenden Positionen werden übernommen.</p>
        </div>
        {transfer.positions.length > 0 && <strong>{formatMoney(totals.netTotal)} netto</strong>}
      </div>
      <div className="space-y-2 text-sm">
        {transfer.positions.map((position, index) => (
          <div key={index} className="flex flex-wrap justify-between gap-2 border-b pb-2">
            <div className="min-w-0 flex-1 break-words">
              <p>{position.description}</p>
              <p className="text-xs text-muted-foreground">{formatNumber(position.quantity)} {position.unit} × {formatMoney(position.unit_price)}</p>
            </div>
            <span>{formatMoney(position.quantity * position.unit_price)}</span>
          </div>
        ))}
        {transfer.positions.length > 0 ? <>
          <p className="flex justify-between"><span>Umsatzsteuer ({formatNumber(state.vatRate)} %)</span><span>{formatMoney(totals.vatAmount)}</span></p>
          <p className="flex justify-between font-semibold"><span>Gesamtbetrag</span><span>{formatMoney(totals.grossTotal)}</span></p>
        </> : <p className="text-muted-foreground">Noch keine berechneten Positionen. Bitte zuerst die Leistungsdaten vervollständigen.</p>}
      </div>
      {transfer.issues.length > 0 && <ul className="space-y-1 text-xs text-destructive" role="alert">{transfer.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={transferConfirmed} disabled={transfer.issues.length > 0} onCheckedChange={(value) => setTransferConfirmed(value === true)} />
        Positionen und Gesamtpreis geprüft und bestätigt
      </label>
      <Button className="w-full" disabled={state.toQuote.isPending || transfer.issues.length > 0 || !transferConfirmed} onClick={() => state.toQuote.mutate()}>
        <FileSignature className="size-4" /> {state.toQuote.isPending ? "Angebot wird erstellt…" : "In Angebot übernehmen"}
      </Button>
      <p className="text-xs text-muted-foreground">Erstellt einen bearbeitbaren Angebotsentwurf. Es wird nichts versendet. Die anderen Kalkulationsbereiche bleiben unverändert.</p>
    </section>
  );
}
