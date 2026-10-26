import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/kalkulation-engine";

export type PriceChoice = "minimum" | "recommended" | "customer";

/** All amounts use the proposal's billing period and include its discounts. */
export function PriceOverview({ oneTime, minimum, recommended, customer, onConfirmChoice }: {
  oneTime: boolean;
  minimum: number;
  recommended: number;
  customer: number;
  onConfirmChoice?: (choice: PriceChoice) => void;
}) {
  const [selected, setSelected] = useState<PriceChoice | null>(null);
  const [confirmedChoice, setConfirmedChoice] = useState<PriceChoice | null>(null);
  const difference = round2(customer - minimum);
  const choices: Array<{ key: PriceChoice; label: string; value: number }> = [
    { key: "minimum", label: "Mindestpreis (Kosten)", value: minimum },
    { key: "recommended", label: "Empfohlener Preis (Ziel)", value: recommended },
    { key: "customer", label: "Kundenpreis nach Rabatt", value: customer },
  ];
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <p className="font-medium">{oneTime ? "Preisübersicht je Auftrag (netto)" : "Preisübersicht im Monatsdurchschnitt (netto)"}</p>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Preis auswählen">
        {choices.map((choice) => (
          <button key={choice.key} type="button" aria-pressed={selected === choice.key} disabled={!onConfirmChoice}
            className={`rounded border p-3 text-left transition-colors ${selected === choice.key ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-transparent bg-muted/40"}`}
            onClick={() => { setSelected(choice.key); setConfirmedChoice(null); }}>
            <span className="block text-xs text-muted-foreground">{choice.label}</span>
            <strong>{formatMoney(choice.value)}</strong>
            {selected === choice.key && <span className="mt-1 block text-xs font-medium text-primary">Ausgewählt</span>}
          </button>
        ))}
      </div>
      {onConfirmChoice && <Button type="button" className="w-full sm:w-auto" disabled={!selected} onClick={() => { if (selected) { onConfirmChoice(selected); setConfirmedChoice(selected); } }}>Preisauswahl bestätigen</Button>}
      {confirmedChoice && <p className="text-sm font-medium text-primary">Preisauswahl bestätigt.</p>}
      {onConfirmChoice && <p className="text-xs text-muted-foreground">Preis auswählen und anschließend bestätigen. Arbeitszeit, Stundensatz, Zusatzleistungen und Rabatt bleiben danach korrigierbar.</p>}
      <p className={difference < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>Differenz zum Mindestpreis: {formatMoney(difference)} {difference < 0 ? "– unter Kosten!" : "– vor weiteren nicht erfassten Kosten"}</p>
      <p className="text-xs text-muted-foreground">Orientierung anhand der aktuell übernommenen Arbeitsstunden und Kosten pro Reinigungsstunde. Kosten, Zielpreis und Kundenpreis beziehen sich auf denselben Zeitraum. Anfahrt und Zusatzleistungen sind im Kundenpreis enthalten; zusätzliche Arbeits-, Fahr- und Rüstzeiten bitte separat prüfen. Kein automatisches Speichern oder Ändern von Angeboten.</p>
    </div>
  );
}
