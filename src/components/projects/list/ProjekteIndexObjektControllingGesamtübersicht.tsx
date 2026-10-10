import { Link } from "@tanstack/react-router";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatMoney, formatNumber } from "@/lib/format";

import type { ProjekteIndexState } from "./useProjekteIndexState";
export function ProjekteIndexObjektControllingGesamtübersicht({
  state,
}: {
  state: ProjekteIndexState;
}) {
  const {
    controllingMonth,
    controllingRows,
    portfolioContribution,
    portfolioCosts,
    portfolioMargin,
    portfolioRevenue,
    setControllingMonth,
  } = state;
  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Objekt-Controlling · Gesamtübersicht</h2>
          <p className="text-sm text-muted-foreground">
            Vergleich aller Objekte nach Marge und Deckungsbeitrag.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="portfolio-controlling-month">Monat</Label>
          <Input
            id="portfolio-controlling-month"
            type="month"
            value={controllingMonth}
            onChange={(e) => setControllingMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Umsatz netto</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(portfolioRevenue)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Gesamtkosten</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(portfolioCosts)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Deckungsbeitrag</div>
          <div className="mt-1 text-xl font-semibold">{formatMoney(portfolioContribution)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Marge gesamt</div>
          <div className="mt-1 text-xl font-semibold">
            {portfolioMargin == null ? "–" : `${formatNumber(portfolioMargin)} %`}
          </div>
        </div>
      </div>

      {controllingRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Keine Objekte vorhanden.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Objekt</th>
                <th className="px-3 py-2 text-right font-medium">Umsatz</th>
                <th className="px-3 py-2 text-right font-medium">Plan</th>
                <th className="px-3 py-2 text-right font-medium">Ist</th>
                <th className="px-3 py-2 text-right font-medium">Kosten</th>
                <th className="px-3 py-2 text-right font-medium">DB</th>
                <th className="px-3 py-2 text-right font-medium">Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {controllingRows.map((row) => {
                const marginClass =
                  row.margin == null
                    ? "text-muted-foreground"
                    : row.margin >= 25
                      ? "text-emerald-700"
                      : row.margin >= 10
                        ? "text-amber-700"
                        : "text-destructive";
                return (
                  <tr key={row.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link
                        to="/projekte/$id"
                        params={{ id: row.id }}
                        className="font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {[row.customer, row.city].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.revenue)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.plannedHours)} Std.</td>
                    <td className="px-3 py-2 text-right">{formatNumber(row.actualHours)} Std.</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.totalCosts)}</td>
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
      )}
    </section>
  );
}
