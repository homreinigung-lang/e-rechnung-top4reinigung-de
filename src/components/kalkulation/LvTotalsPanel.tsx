import { formatMoney, formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { KalkulationStateContext } from "./useKalkulationState";

export function LvTotalsPanel({ state }: { state: KalkulationStateContext }) {
  const { suggested, lvPositions, lvTotal, vatRate, vatAmount, grossTotal } = state;
  return (
    <>
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>Vorschlag Grundkalkulation (netto)</span>
            <span>{formatMoney(suggested)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Quelle: Grundkalkulation (primär für Ausschreibungen/LV). Über „Grundkalkulation für
            Angebot übernehmen“ werden diese Werte als Positionen in das Leistungsverzeichnis
            geschrieben. Maßgeblich für Angebot und PDF ist immer die Summe der LV-Positionen.
          </p>
        </div>

        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Positionen im Leistungsverzeichnis</span>
            <span>{lvPositions.length}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>Gesamt netto</span>
            <span>{formatMoney(lvTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{vatRate > 0 ? `zzgl. ${formatNumber(vatRate)} % MwSt.` : "Umsatzsteuer"}</span>
            <span>{formatMoney(vatAmount)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>{vatRate > 0 ? "Gesamt brutto" : "Gesamtbetrag"}</span>
            <span>{formatMoney(grossTotal)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der LV-Positionen –
            ohne stille Ausgleichsposition.
          </p>
        </div>

    </>
  );
}
