import { formatMoney } from "@/lib/format";
import { round2 } from "@/lib/kalkulation-engine";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

/** Use the selected billing method and price from Leistungsdaten. */
export function CleaningPriceSummary({ hours, state }: {
  hours: number;
  state: Pick<KalkulationStateContext, "hourlyRate" | "selfCostPerHour" | "targetSellingRate" | "mode" | "type" | "area" | "pricePerSqm">;
}) {
  const byArea = state.mode === "area" && state.type !== "glas";
  const price = byArea ? num(state.area) * num(state.pricePerSqm) : hours * round2(num(state.hourlyRate));
  return (
    <div className="space-y-1">
      <p>Reinigungspreis je Einsatz (netto): <strong>{formatMoney(price)}</strong> · {byArea ? `Gewählter Flächenpreis: ${formatMoney(num(state.pricePerSqm))}/m²` : `Gewählter Stundensatz: ${formatMoney(num(state.hourlyRate))}/Std.`}</p>
      <p className="text-xs text-muted-foreground">Selbstkosten Reinigung: {formatMoney(hours * state.selfCostPerHour)} · Unverbindliche Preisempfehlung: {formatMoney(hours * state.targetSellingRate)} je Einsatz.</p>
      <p className="text-xs text-muted-foreground">Anfahrt, Zusatzleistungen und Rabatt werden in der Gesamtberechnung berücksichtigt. Für den Angebotspreis gelten die gewählte Berechnungsart und der Preis aus den Leistungsdaten.</p>
    </div>
  );
}
