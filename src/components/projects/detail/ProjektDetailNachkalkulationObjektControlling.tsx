import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatMoney, formatNumber } from "@/lib/format";

import type { ProjektDetailState } from "./useProjektDetailState";
export function ProjektDetailNachkalkulationObjektControlling({
  state,
}: {
  state: ProjektDetailState;
}) {
  const {
    actualHours,
    contribution,
    controllingMonth,
    costPerHour,
    hourVariance,
    marginPercent,
    marginStatus,
    materialAndOtherCosts,
    plannedHours,
    revenueNet,
    revenuePerHour,
    setControllingMonth,
    totalCosts,
    trendRows,
    wageCosts,
  } = state;
  return (
    <section id="objekt-controlling" className="surface scroll-mt-20 space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Nachkalkulation / Objekt-Controlling</h2>
          <p className="text-sm text-muted-foreground">
            Geplante und tatsächliche Stunden, Umsatz, Kosten und Marge im gewählten Monat.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="controlling-month">Monat</Label>
          <Input
            id="controlling-month"
            type="month"
            value={controllingMonth}
            onChange={(e) => setControllingMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Umsatz netto", formatMoney(revenueNet)],
          ["Soll-Stunden", `${formatNumber(plannedHours)} Std.`],
          ["Ist-Stunden", `${formatNumber(actualHours)} Std.`],
          [
            "Soll/Ist-Abweichung",
            `${hourVariance >= 0 ? "+" : ""}${formatNumber(hourVariance)} Std.`,
          ],
          ["Personalkosten", formatMoney(wageCosts)],
          ["Weitere Objektkosten", formatMoney(materialAndOtherCosts)],
          ["Gesamtkosten", formatMoney(totalCosts)],
          ["Deckungsbeitrag", formatMoney(contribution)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Marge</div>
          <div className="mt-1 text-2xl font-semibold">
            {marginPercent == null ? "–" : `${formatNumber(marginPercent)} %`}
          </div>
          <div className={`mt-1 text-sm font-medium ${marginStatus.className}`}>
            {marginStatus.label}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Kosten / Ist-Stunde</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(costPerHour)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Umsatz / Ist-Stunde</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(revenuePerHour)}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <h3 className="font-medium">6-Monats-Vergleich</h3>
          <p className="text-xs text-muted-foreground">
            Entwicklung von Umsatz, Kosten, Deckungsbeitrag und Marge.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Monat</th>
                <th className="px-3 py-2 text-right font-medium">Umsatz</th>
                <th className="px-3 py-2 text-right font-medium">Kosten</th>
                <th className="px-3 py-2 text-right font-medium">DB</th>
                <th className="px-3 py-2 text-right font-medium">Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trendRows.map((row) => {
                const marginClass =
                  row.margin == null
                    ? "text-muted-foreground"
                    : row.margin >= 25
                      ? "text-emerald-700"
                      : row.margin >= 10
                        ? "text-amber-700"
                        : "text-destructive";
                const label = new Date(`${row.month}-01T12:00:00`).toLocaleDateString(
                  "de-DE-u-ca-gregory-nu-latn",
                  { month: "short", year: "numeric" },
                );
                return (
                  <tr key={row.month}>
                    <td className="px-3 py-2 font-medium">{label}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.revenue)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.costs)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.contribution)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${marginClass}`}>
                      {row.margin == null ? "–" : `${formatNumber(row.margin)} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Zugeordnete Rechnungen und Ausgaben werden direkt berücksichtigt. Historische,
        festgeschriebene Rechnungen bleiben GoBD-konform unverändert und werden nur dann rechnerisch
        zugeordnet, wenn der Kunde eindeutig genau ein Objekt hat.
      </p>
    </section>
  );
}
