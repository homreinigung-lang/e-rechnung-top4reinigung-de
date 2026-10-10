import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatMoney } from "@/lib/format";

import { Leistungswerte } from "@/components/Leistungswerte";

import type { EinstellungenState } from "./useEinstellungenState";
export function EinstellungenKalkulationsgrundlagen({ state }: { state: EinstellungenState }) {
  const { form, save, setForm, settingsBurdenPerHour, settingsSelfCost, settingsTargetRate } =
    state;
  return (
    <details className="surface group overflow-hidden">
      <summary className="cursor-pointer list-none p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Kalkulationsgrundlagen</h2>
            <p className="text-sm text-muted-foreground">
              Kostenbasis und Leistungswerte zentral pflegen. Der Bereich bleibt standardmäßig
              geschlossen und nimmt dadurch wenig Platz ein.
            </p>
          </div>
          <span className="text-sm font-medium text-primary group-open:hidden">Öffnen</span>
          <span className="hidden text-sm font-medium text-primary group-open:inline">
            Schließen
          </span>
        </div>
      </summary>

      <div className="space-y-6 border-t px-6 pb-6 pt-5">
        <div className="space-y-4">
          <div>
            <h3 className="font-display font-semibold">Kostenbasis</h3>
            <p className="text-sm text-muted-foreground">
              Diese Werte gelten zentral für neue Kalkulationen. Änderungen erfolgen nur hier in den
              Firmeneinstellungen.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="calc_worker_hourly_wage">Mitarbeiterlohn brutto / Std.</Label>
              <Input
                id="calc_worker_hourly_wage"
                inputMode="decimal"
                value={form["calc_worker_hourly_wage"] ?? "15"}
                onChange={(e) => setForm({ ...form, calc_worker_hourly_wage: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc_labor_burden_percent">Lohnnebenkosten (%)</Label>
              <Input
                id="calc_labor_burden_percent"
                inputMode="decimal"
                value={form["calc_labor_burden_percent"] ?? "32"}
                onChange={(e) => setForm({ ...form, calc_labor_burden_percent: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc_material_cost_hour">Material / Std.</Label>
              <Input
                id="calc_material_cost_hour"
                inputMode="decimal"
                value={form["calc_material_cost_hour"] ?? "1,20"}
                onChange={(e) => setForm({ ...form, calc_material_cost_hour: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc_overhead_cost_hour">Gemeinkosten / Std.</Label>
              <Input
                id="calc_overhead_cost_hour"
                inputMode="decimal"
                value={form["calc_overhead_cost_hour"] ?? "3,50"}
                onChange={(e) => setForm({ ...form, calc_overhead_cost_hour: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc_profit_markup_percent">Gewinnaufschlag (%)</Label>
              <Input
                id="calc_profit_markup_percent"
                inputMode="decimal"
                value={form["calc_profit_markup_percent"] ?? "20"}
                onChange={(e) => setForm({ ...form, calc_profit_markup_percent: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 rounded-md border bg-muted/40 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Lohnnebenkosten / Std.</p>
              <p className="font-semibold">{formatMoney(settingsBurdenPerHour)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Selbstkosten / Std.</p>
              <p className="font-semibold">{formatMoney(settingsSelfCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ziel-Verkaufspreis / Std.</p>
              <p className="font-semibold">{formatMoney(settingsTargetRate)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Die Werte sind intern und erscheinen nicht im Kundenangebot.
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Kostenbasis speichern
          </Button>
        </div>

        <Leistungswerte embedded />
      </div>
    </details>
  );
}
