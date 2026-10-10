import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function CalculationBasis({ state }: { state: KalkulationStateContext }) {
  const {
    laborBurdenPerHour,
    laborBurdenPercent,
    laborWage,
    materialCost,
    navigate,
    overheadCost,
    profitMarkup,
    selfCostPerHour,
    visiblePerformanceRates,
  } = state;
  return (
    <details className="group rounded-lg border bg-muted/20">
      <summary className="cursor-pointer list-none p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Kalkulationsgrundlagen</p>
            <p className="text-xs text-muted-foreground">
              Kostenbasis {formatMoney(selfCostPerHour)} / Std. · {visiblePerformanceRates.length}{" "}
              Leistungswerte
            </p>
          </div>
          <span className="text-xs font-medium text-primary group-open:hidden">Anzeigen</span>
          <span className="hidden text-xs font-medium text-primary group-open:inline">
            Schließen
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-md bg-background/70 p-2">
            <p className="text-[11px] text-muted-foreground">Lohn brutto / Std.</p>
            <p className="text-sm font-medium">{formatMoney(num(laborWage))}</p>
          </div>
          <div className="rounded-md bg-background/70 p-2">
            <p className="text-[11px] text-muted-foreground">Lohnnebenkosten</p>
            <p className="text-sm font-medium">
              {formatNumber(num(laborBurdenPercent))} % · {formatMoney(laborBurdenPerHour)}
            </p>
          </div>
          <div className="rounded-md bg-background/70 p-2">
            <p className="text-[11px] text-muted-foreground">Material / Std.</p>
            <p className="text-sm font-medium">{formatMoney(num(materialCost))}</p>
          </div>
          <div className="rounded-md bg-background/70 p-2">
            <p className="text-[11px] text-muted-foreground">Gemeinkosten / Std.</p>
            <p className="text-sm font-medium">{formatMoney(num(overheadCost))}</p>
          </div>
          <div className="rounded-md bg-background/70 p-2">
            <p className="text-[11px] text-muted-foreground">Gewinnaufschlag</p>
            <p className="text-sm font-medium">{formatNumber(num(profitMarkup))} %</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Leistungswerte</p>
            <p className="text-xs text-muted-foreground">m² pro Stunde</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {visiblePerformanceRates.slice(0, 4).map((rate) => (
              <div key={rate.id} className="rounded-md border bg-background/70 p-2">
                <p className="truncate text-xs text-muted-foreground">{rate.label}</p>
                <p className="text-sm font-semibold">{formatNumber(rate.sqm_per_hour)} m²/h</p>
              </div>
            ))}
          </div>
          {visiblePerformanceRates.length > 4 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              + {visiblePerformanceRates.length - 4} weitere Leistungswerte in den Einstellungen
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/einstellungen" })}
        >
          Kostenbasis & Leistungswerte ändern
        </Button>
      </div>
    </details>
  );
}
