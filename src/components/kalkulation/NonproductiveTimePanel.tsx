import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  sellingRatePerPaidHour: number;
  onApplyCustomerRate?: (rate: number) => void;
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
  sellingRatePerPaidHour,
  onApplyCustomerRate,
}: Props) {
  const [travel, setTravel] = useState("0");
  const [preparation, setPreparation] = useState("0");
  const [other, setOther] = useState("0");
  const [appliedRate, setAppliedRate] = useState<number | null>(null);
  const previewRate = appliedRate ?? sellingRatePerPaidHour;
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
      sellingRatePerPaidHour: previewRate,
    }),
    [cleaningHoursPerMonth, travel, preparation, other, laborCostPerHour, materialCostPerHour, overheadCostPerHour, profitMarkupPercent, previewRate],
  );

  const operatingResult = comparison.estimatedMonthlyResult;
  const adjustedHourlyRate = cleaningHoursPerMonth > 0
    ? Math.round((comparison.suggestedMonthlyRevenue / cleaningHoursPerMonth) * 100) / 100
    : 0;
  const cleaning = Math.max(0, cleaningHoursPerMonth);
  const travelHours = positiveNumber(travel);
  const preparationHours = positiveNumber(preparation);
  const otherHours = positiveNumber(other);
  const resultPerCleaningHour = cleaningHoursPerMonth > 0 ? operatingResult / cleaningHoursPerMonth : null;
  return (
    <details className="rounded-md border">
      <summary className="cursor-pointer p-3 text-sm font-medium">
        Gesamtarbeitszeit – Kundenkalkulation (Vorschau)
      </summary>
      <div className="space-y-3 border-t p-3">
        <p className="text-xs text-muted-foreground">
          Kundenkalkulation: Reinigungs-, Fahrt-, Vorbereitungs- und sonstige bezahlte Zeiten
          zusammen mit {formatNumber(cleaningHoursPerMonth)} Reinigungsstunden pro Monat zum gleichen Stundensatz. Material nur für Reinigungsstunden.
          Keine Änderung an LV-Positionen, Angeboten oder gespeicherten Daten.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="nonproductive-travel">Bezahlte Fahrtzeit (Std./Monat)</Label>
            <Input id="nonproductive-travel" inputMode="decimal" value={travel} onChange={(event) => { setTravel(event.target.value); setAppliedRate(null); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nonproductive-preparation">Vorbereitung (Std./Monat)</Label>
            <Input id="nonproductive-preparation" inputMode="decimal" value={preparation} onChange={(event) => { setPreparation(event.target.value); setAppliedRate(null); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nonproductive-other">Sonstige bezahlte Zeit (Std./Monat)</Label>
            <Input id="nonproductive-other" inputMode="decimal" value={other} onChange={(event) => { setOther(event.target.value); setAppliedRate(null); }} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="text-sm">Zusätzliche Stunden: <strong>{formatNumber(comparison.nonproductiveHoursPerMonth)}</strong></p>
          <p className="text-sm">Bezahlte Stunden gesamt: <strong>{formatNumber(comparison.paidHoursPerMonth)}</strong></p>
          <p className="text-sm">Monatliche Gesamtkosten: <strong>{formatMoney(comparison.totalMonthlyCost)}</strong></p>
          <p className="text-sm">Kostendeckend / Reinigungsstd.: <strong>{comparison.breakEvenPerCleaningHour === null ? "–" : formatMoney(comparison.breakEvenPerCleaningHour)}</strong></p>
          <p className="text-sm">Zielpreis / Reinigungsstd.: <strong>{comparison.targetPerCleaningHour === null ? "–" : formatMoney(comparison.targetPerCleaningHour)}</strong></p>
        </div>
        <div className={`rounded-md border p-3 text-sm ${operatingResult < 0 ? "border-red-500/60" : "border-emerald-500/60"}`}>
          <p className="font-semibold">Kundenpreis aus gesamter Arbeitszeit (netto)</p>
          <p>Reinigung: {formatNumber(cleaning)} Std. × {formatMoney(previewRate)} = {formatMoney(cleaning * sellingRatePerPaidHour)}</p>
          <p>Fahrtzeit: {formatNumber(travelHours)} Std. × {formatMoney(previewRate)} = {formatMoney(travelHours * sellingRatePerPaidHour)}</p>
          <p>Vorbereitung: {formatNumber(preparationHours)} Std. × {formatMoney(previewRate)} = {formatMoney(preparationHours * sellingRatePerPaidHour)}</p>
          {otherHours > 0 && <p>Sonstige Zeit: {formatNumber(otherHours)} Std. × {formatMoney(previewRate)} = {formatMoney(otherHours * sellingRatePerPaidHour)}</p>}
          <p className="font-semibold">Kundenpreis (alle bezahlten Stunden): <strong>{formatMoney(comparison.suggestedMonthlyRevenue)}</strong></p>
          <p>Gesamtkosten: <strong>{formatMoney(comparison.totalMonthlyCost)}</strong></p>
          <p>Ergebnis nach Gesamtkosten: <strong>{formatMoney(operatingResult)}</strong></p>
          <p>Ergebnis je Reinigungsstunde (Vergleich): <strong>{resultPerCleaningHour === null ? "–" : formatMoney(resultPerCleaningHour)}</strong></p>
          <p className="text-xs text-muted-foreground">Interne Simulation vor Steuern. Keine automatische Preisübernahme.</p>
          {onApplyCustomerRate && adjustedHourlyRate > 0 && appliedRate === null && (
            <Button type="button" variant="outline" className="mt-2" onClick={() => { setAppliedRate(previewRate); onApplyCustomerRate(adjustedHourlyRate); }}>
              Berechneten Preis übernehmen ({formatMoney(adjustedHourlyRate)} / Reinigungsstd.)
            </Button>
          )}
          {appliedRate !== null && <p className="text-xs font-medium">Preis in die Grundkalkulation übernommen. Bitte Positionen vor dem Angebot prüfen.</p>}
          {onApplyCustomerRate && <p className="text-xs text-muted-foreground">Übernimmt den Gesamtpreis als umgerechneten Stundensatz in die Grundkalkulation. LV-Positionen und Angebote bleiben unverändert, bis Sie die Grundkalkulation ausdrücklich übernehmen.</p>}
        </div>
        <p className="text-xs text-muted-foreground">
          Die Eingaben gelten nur für diese Vorschau und werden nicht gespeichert.
          Fahrtkosten als Geldbetrag in der Angebotskalkulation bleiben davon unabhängig.
        </p>
      </div>
    </details>
  );
}
