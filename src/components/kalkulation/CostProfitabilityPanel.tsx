import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { NonproductiveTimePanel } from "./NonproductiveTimePanel";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function CostProfitabilityPanel({ state }: { state: KalkulationStateContext }) {
  const { selfCostPerHour, targetSellingRate, economyLevel, lvPositions,
    profitabilityRevenue, laborWage, laborBurdenPercent, laborBurdenPerHour,
    materialCost, overheadCost, profitMarkup, effectiveSellingRate,
    contribution, contributionMargin, costingMonthlyHours, monthlySelfCost,
    targetMonthlyRevenue, mode, hourlyRate, roomCalculation, setHourlyRate,
    setConfirmed, navigate } = state;
  const once = state.frequencyUnit === "once";
  return (
        <details className="group rounded-md border">
          <summary className="cursor-pointer list-none p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Kosten & Wirtschaftlichkeit</p>
                <p className="text-xs text-muted-foreground">
                  Selbstkosten {formatMoney(selfCostPerHour)} / Std. · Ziel{" "}
                  {formatMoney(targetSellingRate)} / Std.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    economyLevel === "good"
                      ? "font-medium text-emerald-700 dark:text-emerald-300"
                      : economyLevel === "tight"
                        ? "font-medium text-amber-700 dark:text-amber-300"
                        : "font-medium text-red-700 dark:text-red-300"
                  }
                >
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend"
                      : "Nicht kostendeckend"}
                </span>
                <span className="text-primary group-open:hidden">Details</span>
                <span className="hidden text-primary group-open:inline">Schließen</span>
              </div>
            </div>
          </summary>

          <div className="space-y-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              Erlösbasis: {lvPositions.length > 0 ? "LV-Endsumme (netto)" : "Kalkulationsvorschlag (netto)"} · {formatMoney(profitabilityRevenue)}. Die Deckungsbeitragsrechnung setzt voraus, dass Erlös und Selbstkosten denselben Abrechnungszeitraum betreffen; bei einmaligen LV-Positionen bitte separat prüfen.
            </p>
            <p className="text-xs text-muted-foreground">
              Kostenbasis und Leistungswerte werden zentral unter Einstellungen →
              Kalkulationsgrundlagen gepflegt. Hier werden sie nur zur Kalkulation angezeigt.
            </p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohn brutto / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(laborWage))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohnnebenkosten</p>
                <p className="text-sm font-medium">
                  {formatNumber(num(laborBurdenPercent))} % · {formatMoney(laborBurdenPerHour)}
                </p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Material / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(materialCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gemeinkosten / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(overheadCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gewinnaufschlag</p>
                <p className="text-sm font-medium">{formatNumber(num(profitMarkup))} %</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Selbstkosten / Std.</p>
                <p className="font-semibold">{formatMoney(selfCostPerHour)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Ziel-Verkaufspreis / Std.</p>
                <p className="font-semibold">{formatMoney(targetSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Effektiver Erlös / Std.</p>
                <p className="font-semibold">{formatMoney(effectiveSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{once ? "Deckungsbeitrag je Auftrag" : "Deckungsbeitrag / Monat"}</p>
                <p className="font-semibold">{formatMoney(contribution)}</p>
              </div>
            </div>

            <div
              className={
                economyLevel === "good"
                  ? "rounded-md border border-emerald-500/60 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : economyLevel === "tight"
                    ? "rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    : "rounded-md border border-red-500/60 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend, aber unter Zielmarge"
                      : "Nicht kostendeckend"}
                </strong>
                <span>
                  Marge {formatNumber(contributionMargin)} % · {formatNumber(costingMonthlyHours)}{" "}
                  {once ? "Std./Auftrag" : "Std./Monat"}
                </span>
              </div>
              <p className="mt-1 text-xs opacity-80">
                {once ? "Selbstkosten je Auftrag" : "Monatliche Selbstkosten"} {formatMoney(monthlySelfCost)} · Zielumsatz bei gewünschter
                Marge {formatMoney(targetMonthlyRevenue)}
              </p>
            </div>

            <NonproductiveTimePanel
              oneTime={once}
              cleaningHoursPerMonth={costingMonthlyHours}
              sellingRatePerPaidHour={mode === "hours" ? num(hourlyRate) : effectiveSellingRate}
              onApplyCustomerRate={mode === "hours" && !roomCalculation.enabled && lvPositions.length === 0 ? (rate) => {
                setHourlyRate(String(rate).replace(".", ","));
                setConfirmed(false);
              } : undefined}
              laborCostPerHour={num(laborWage) + laborBurdenPerHour}
              materialCostPerHour={num(materialCost)}
              overheadCostPerHour={num(overheadCost)}
              profitMarkupPercent={num(profitMarkup)}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/einstellungen" })}
              >
                Kostenbasis & Leistungswerte ändern
              </Button>
              {mode === "hours" && targetSellingRate > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHourlyRate(String(targetSellingRate).replace(".", ","))}
                >
                  Ziel-Stundensatz übernehmen
                </Button>
              ) : null}
            </div>
          </div>
        </details>
  );
}
