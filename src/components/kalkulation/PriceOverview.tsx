import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/kalkulation-engine";

/** All amounts use the proposal's billing period and include its discounts. */
export function PriceOverview({ oneTime, minimum, recommended, customer, onSelectRecommended }: {
  oneTime: boolean;
  minimum: number;
  recommended: number;
  customer: number;
  onSelectRecommended?: () => void;
}) {
  const difference = round2(customer - minimum);
  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <p className="font-medium">{oneTime ? "Preisübersicht je Auftrag (netto)" : "Preisübersicht im Monatsdurchschnitt (netto)"}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Mindestpreis (Kosten)</p><strong>{formatMoney(minimum)}</strong></div>
        <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Empfohlener Preis (Ziel)</p><strong>{formatMoney(recommended)}</strong>{onSelectRecommended && <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={onSelectRecommended}>Empfohlenen Preis übernehmen</Button>}</div>
        <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Kundenpreis nach Rabatt</p><strong>{formatMoney(customer)}</strong></div>
      </div>
      {onSelectRecommended && <p className="text-xs text-muted-foreground">Die Auswahl übernimmt den kalkulierten Stundensatz. Zusatzleistungen und Rabatte bleiben bestehen. Der Stundensatz und die Arbeitszeit bleiben frei korrigierbar.</p>}
      <p className={difference < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>Differenz zum Mindestpreis: {formatMoney(difference)} {difference < 0 ? "– unter Kosten!" : "– vor weiteren nicht erfassten Kosten"}</p>
      <p className="text-xs text-muted-foreground">Orientierung anhand der aktuell übernommenen Arbeitsstunden und Kosten pro Reinigungsstunde. Kosten, Zielpreis und Kundenpreis beziehen sich auf denselben Zeitraum. Anfahrt und Zusatzleistungen sind im Kundenpreis enthalten; zusätzliche Arbeits-, Fahr- und Rüstzeiten bitte separat prüfen. Kein automatisches Speichern oder Ändern von Angeboten.</p>
    </div>
  );
}
