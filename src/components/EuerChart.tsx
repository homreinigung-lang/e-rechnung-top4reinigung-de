import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";
import { isEuerIncome } from "@/lib/euer";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type DocLite = {
  type: string;
  status: string;
  issue_date: string;
  net_total?: number | string | null;
  total?: number | string | null;
};

type ExpenseLite = {
  expense_date: string;
  net_amount: number | string;
};

interface EuerChartProps {
  year: number;
  docs: DocLite[];
  expenses: ExpenseLite[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Monatlicher Vergleich Einnahmen vs. Ausgaben + Gewinn im laufenden Jahr. */
export function EuerChart({ year, docs, expenses }: EuerChartProps) {
  const monthly = useMemo(() => {
    // Identische Einnahmen-Definition wie computeEuer / Finanz-Dashboard.
    const income = docs.filter((d) => isEuerIncome(d as unknown as Record<string, unknown>));
    const exp = expenses.filter((e) => String(e.expense_date).slice(0, 4) === String(year));
    const incInYear = income.filter((d) => String(d.issue_date).slice(0, 4) === String(year));

    return MONTHS.map((label, i) => {
      const m = String(i + 1).padStart(2, "0");
      const prefix = `${year}-${m}`;
      const inc = incInYear
        .filter((d) => String(d.issue_date).startsWith(prefix))
        .reduce((s, d) => s + num(d.net_total ?? d.total), 0);
      const out = exp
        .filter((e) => String(e.expense_date).startsWith(prefix))
        .reduce((s, e) => s + num(e.net_amount), 0);
      return { label, einnahmen: inc, ausgaben: out, gewinn: inc - out };
    });
  }, [year, docs, expenses]);

  const totals = useMemo(() => {
    const einnahmen = monthly.reduce((s, m) => s + m.einnahmen, 0);
    const ausgaben = monthly.reduce((s, m) => s + m.ausgaben, 0);
    return { einnahmen, ausgaben, gewinn: einnahmen - ausgaben };
  }, [monthly]);

  const pieData = [
    { name: "Einnahmen", value: totals.einnahmen, color: "hsl(var(--primary))" },
    { name: "Ausgaben", value: totals.ausgaben, color: "#f97316" },
  ].filter((d) => d.value > 0);

  const hasData = totals.einnahmen > 0 || totals.ausgaben > 0;

  const tooltipValue = (v: number) => formatMoney(v);
  const isLoss = totals.gewinn < 0;

  return (
    <div className="space-y-6">


      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Noch keine Buchungen im Jahr {year} vorhanden.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Monatlicher Balken-Vergleich */}
          <div className="surface p-4 lg:col-span-2">
            <h3 className="mb-1 text-sm font-semibold">Einnahmen vs. Ausgaben je Monat</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Netto-Beträge pro Monat – der Gewinn ergibt sich aus der Differenz.
            </p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    width={56}
                    tickFormatter={(v: number) => `${Math.round(v).toLocaleString("de-DE")}`}
                  />
                  <Tooltip
                    formatter={(v: number) => tooltipValue(v)}
                    labelFormatter={(l: string) => `${l} ${year}`}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="einnahmen"
                    name="Einnahmen"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar dataKey="ausgaben" name="Ausgaben" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gewinn-Verlauf + Anteile */}
          <div className="space-y-6">
            <div className="surface p-4">
              <h3 className="mb-1 text-sm font-semibold">Gewinn-Verlauf</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Netto-Monatsergebnis über das Jahr.
              </p>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                      vertical={false}
                    />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: number) => tooltipValue(v)}
                      labelFormatter={(l: string) => `${l} ${year}`}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="gewinn"
                      name="Gewinn"
                      stroke={isLoss ? "hsl(var(--destructive))" : "#16a34a"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

      )}
    </div>
  );
}
