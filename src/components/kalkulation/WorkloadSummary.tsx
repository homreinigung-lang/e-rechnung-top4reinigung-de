import { formatMoney, formatNumber } from "@/lib/format";
import { round2 } from "@/lib/kalkulation-engine";
import { cleaningHoursPerVisit } from "@/lib/cleaning-hours";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function WorkloadSummary({ state }: { state: KalkulationStateContext }) {
  const hoursPerVisit = cleaningHoursPerVisit({ mode: state.mode, typeValue: state.type,
    area: num(state.area), glassArea: num(state.glassArea), hours: num(state.hours),
    sqmPerHour: Number(state.selectedPerformanceRate?.sqm_per_hour ?? 0) });
  const net = round2(state.suggested);
  const vat = round2(net * state.vatRate / 100);
  const gross = round2(net + vat);
  return <section aria-label="Live-Kalkulation" className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
    <p className="font-medium">Aktuelle Kalkulation · {state.frequencyUnit === "once" ? "einmaliger Auftrag" : "pro Monat"}</p>
    <div className="flex justify-between"><span>Arbeitszeit je Einsatz</span><strong>{formatNumber(hoursPerVisit)} Std.</strong></div>
    <div className="flex justify-between"><span>{state.frequencyUnit === "once" ? "Arbeitszeit gesamt" : "Arbeitszeit pro Monat"}</span><strong>{formatNumber(state.monthlyHours)} Std.</strong></div>
    <div className="flex justify-between"><span>Stundensatz netto</span><strong>{formatMoney(num(state.hourlyRate))}</strong></div>
    <div className="flex justify-between border-t pt-2"><span>Gesamt netto</span><strong>{formatMoney(net)}</strong></div>
    <div className="flex justify-between"><span>Umsatzsteuer ({formatNumber(state.vatRate)} %)</span><strong>{formatMoney(vat)}</strong></div>
    <div className="flex justify-between text-base"><span>Gesamt brutto</span><strong>{formatMoney(gross)}</strong></div>
    {num(state.hourlyRate) <= 0 && <p className="text-xs text-muted-foreground">Für den Angebotspreis bitte den Stundensatz eingeben oder den kalkulierten Stundensatz übernehmen.</p>}
  </section>;
}