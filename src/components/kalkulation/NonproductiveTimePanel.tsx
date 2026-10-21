import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatNumber } from "@/lib/format";
import { calculateNonproductiveTime } from "@/lib/nonproductive-time";

type Props = {
  cleaningHoursPerMonth: number;
  laborCostPerHour: number;
  materialCostPerHour: number;
  overheadCostPerHour: number;
  profitMarkupPercent: number;
};

function positiveNumber(value: string): number {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function NonproductiveTimePanel({
  cleaningHoursPerMonth,
  laborCostPerHour,
  materialCostPerHour,
  overheadCostPerHour,
  profitMarkupPercent,
}: Props) {
  const [travel, setTravel] = useState("0");
  const [preparation, setPreparation] = useState("0");
  const [other, setOther] = useState("0");
  const comparison = useMemo(
    () => calculateNonproductiveTime({
      cleaningHoursPerMonth,
      paidTravelHoursPerMonth: positiveNumber(travel),
      paidPreparationHoursPerMonth: positiveNumber(preparation),
      otherPaidHoursPerMonth: positiveNumber(other),
      laborCostPerHour,
      materialCostPerCleaningHour: materialCostPerHour,
      overheadCostPerPaidHour: overheadCostPerHour,
      profitMarkupPercent,
    }),
    [cleaningHoursPerMonth, travel, preparation, other, laborCostPerHour, materialCostPerHour, overheadCostPerHour, profitMarkupPercent],
  );

  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer p-3 text-sm font-medium">
        Zusätzliche Arbeitszeiten – optionale Kostenprüfung
      </summary>
      <div className="space-y-3 border-t p-3">
        <p className="text-xs text-muted-foreground">
          Interne Simulation: Bezahlte Fahrt-, Vorbereitungs- und sonstige Zeiten
          zusätzlich zu {formatNumber(cleaningHoursPerMonth)} Reinigungsstunden pro Monat.
          Keine Änderung an LV-Positionen, Angeboten oder gespeicherten Daten.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="nonproductive-travel">Bezahlte Fahrtzeit (Std./Monat)</Label>
            <Input id="nonproductive-travel" inputMode="decimal" value={travel} onChange={(event) => setTravel(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nonproductive-preparation">Vorbereitung (Std./Monat)</Label>
            <Input id="nonproductive-preparation" inputMode="decimal" value={preparation} onChange={(event) => setPreparation(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nonproductive-other">Sonstige bezahlte Zeit (Std./Monat)</Label>
            <Input id="nonproductive-other" inputMode="decimal" value={other} onChange={(event) => setOther(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="text-sm">Zusätzliche Stunden: <strong>{formatNumber(comparison.nonproductiveHoursPerMonth)}</strong></p>
          <p className="text-sm">Bezahlte Stunden gesamt: <strong>{formatNumber(comparison.paidHoursPerMonth)}</strong></p>
          <p className="text-sm">Monatliche Gesamtkosten: <strong>{formatMoney(comparison.totalMonthlyCost)}</strong></p>
          <p className="text-sm">Kostendeckend / Reinigungsstd.: <strong>{comparison.breakEvenPerCleaningHour === null ? "–" : formatMoney(comparison.breakEvenPerCleaningHour)}</strong></p>
          <p className="text-sm">Zielpreis / Reinigungsstd.: <strong>{comparison.targetPerCleaningHour === null ? "–" : formatMoney(comparison.targetPerCleaningHour)}</strong></p>
        </div>
        <p className="text-xs text-muted-foreground">
          Die Eingaben gelten nur für diese Vorschau und werden nicht gespeichert.
          Fahrtkosten als Geldbetrag in der Angebotskalkulation bleiben davon unabhängig.
        </p>
      </div>
    </details>
  );
}
