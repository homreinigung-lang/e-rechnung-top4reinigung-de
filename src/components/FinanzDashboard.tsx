import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatMoney } from "@/lib/format";
import { aggregateExpensesByCategory, isEuerIncome } from "@/lib/euer";
import { ArrowDownRight, ArrowUpRight, CalendarClock, PieChart as PieIcon } from "lucide-react";

type DocLite = {
  id: string;
  type: string;
  status: string;
  number: string;
  issue_date: string;
  due_date?: string | null;
  total: number | string;
  net_total?: number | string | null;
  customer_name?: string | null;
  customer_company?: string | null;
};

type ExpenseLite = {
  expense_date: string;
  category?: string | null;
  net_amount: number | string;
  gross_amount: number | string;
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Farbpalette für die Kategorien – abgestimmt auf das Dokument-/PDF-Design. */
const CATEGORY_COLORS = [
  "#0f766e",
  "#0891b2",
  "#f97316",
  "#64748b",
  "#7c3aed",
  "#ca8a04",
  "#be123c",
  "#15803d",
];

function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Finanz-Dashboard: Cashflow des laufenden Monats, anstehende Serien,
 * Kostenverteilung nach Kategorie und offene Rechnungen.
 */
export function FinanzDashboard({
  docs,
  expenses,
}: {
  docs: DocLite[];
  expenses: ExpenseLite[];
}) {
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthLabel = new Date().toLocaleDateString("de-DE-u-ca-gregory-nu-latn", {
    month: "long",
    year: "numeric",
  });

  // Gleiche Einnahmen-Definition wie in der EÜR (Entwürfe zählen nicht, Storno mindert).
  const invoices = useMemo(
    () => docs.filter((d) => isEuerIncome(d as unknown as Record<string, unknown>)),
    [docs],
  );

  const revenue = invoices
    .filter((d) => String(d.issue_date).startsWith(monthPrefix))
    .reduce((s, d) => s + num(d.net_total ?? d.total), 0);
  const spend = expenses
    .filter((e) => String(e.expense_date).startsWith(monthPrefix))
    .reduce((s, e) => s + num(e.net_amount), 0);
  const cashflow = revenue - spend;

  const cashData = [{ label: monthLabel, Einnahmen: revenue, Ausgaben: spend }];

  // Kategorieverteilung der Ausgaben im laufenden Jahr
  const yearPrefix = String(new Date().getFullYear());
  const categories = useMemo(
    () =>
      aggregateExpensesByCategory(
        expenses.filter((e) =>
          String(e.expense_date).startsWith(yearPrefix),
        ) as unknown as Record<string, unknown>[],
      )
        .map((c, i) => ({
          name: c.category,
          value: c.net,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
        }))
        .filter((c) => c.value > 0),
    [expenses, yearPrefix],
  );
  const categoryTotal = categories.reduce((s, c) => s + c.value, 0);

  // Anstehende Serien der nächsten 30 Tage
  const until = isoDay(30);
  const { data: upcoming } = useQuery({
    queryKey: ["finanz_dashboard_serien", until],
    queryFn: async () => {
      const [inv, exp] = await Promise.all([
        supabase
          .from("recurring_invoices")
          .select("id, title, next_run, active, documents:template_document_id (total)")
          .eq("active", true)
          .lte("next_run", until)
          .order("next_run"),
        supabase
          .from("recurring_expenses")
          .select("id, title, supplier, next_run, active, gross_amount")
          .eq("active", true)
          .lte("next_run", until)
          .order("next_run"),
      ]);
      if (inv.error) throw inv.error;
      if (exp.error) throw exp.error;
      return {
        income: (inv.data ?? []).map((r) => ({
          id: r.id,
          title: r.title || "Wiederkehrende Rechnung",
          next_run: String(r.next_run),
          amount: num((r.documents as { total?: number } | null)?.total),
        })),
        outgo: (exp.data ?? []).map((r) => ({
          id: r.id,
          title: r.title || r.supplier || "Wiederkehrende Ausgabe",
          next_run: String(r.next_run),
          amount: num(r.gross_amount),
        })),
      };
    },
  });

  const income = upcoming?.income ?? [];
  const outgo = upcoming?.outgo ?? [];

  const openItems = useMemo(
    () =>
      docs
        .filter((d) => d.type === "invoice" && d.status === "sent")
        .sort((a, b) => String(a.due_date ?? "").localeCompare(String(b.due_date ?? "")))
        .slice(0, 6),
    [docs],
  );
  const openTotal = docs
    .filter((d) => d.type === "invoice" && d.status === "sent")
    .reduce((s, d) => s + num(d.total), 0);
  const todayStr = isoDay();

  return (
    <section aria-label="Finanz-Dashboard" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Finanz-Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cashflow, anstehende Serien und offene Posten auf einen Blick.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Cashflow des Monats */}
        <div className="surface p-5 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Cashflow · {monthLabel}</h3>
            <span
              className={`text-sm font-medium ${
                cashflow < 0 ? "text-destructive" : "text-primary"
              }`}
            >
              Saldo {formatMoney(cashflow)}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowUpRight className="size-4 text-primary" /> Einnahmen (netto)
              </div>
              <div className="mt-1 font-display text-2xl font-semibold text-primary">
                {formatMoney(revenue)}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowDownRight className="size-4 text-orange-500" /> Ausgaben (netto)
              </div>
              <div className="mt-1 font-display text-2xl font-semibold text-orange-500 dark:text-orange-400">
                {formatMoney(spend)}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Monatsverlauf und Jahreswerte finden Sie weiter unten in der EÜR-Auswertung.
          </p>
        </div>


        {/* 3. Kategorien */}
        <div className="surface p-5">
          <div className="flex items-center gap-2">
            <PieIcon className="size-4 text-primary" />
            <h3 className="font-semibold">Ausgaben nach Kategorie</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Netto im Jahr {yearPrefix}</p>
          {categories.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              Noch keine Ausgaben erfasst.
            </p>
          ) : (
            <>
              <div className="mt-3 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={44}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {categories.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {categories.slice(0, 5).map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-muted-foreground">
                      {categoryTotal > 0 ? Math.round((c.value / categoryTotal) * 100) : 0} %
                    </span>
                    <span className="font-medium">{formatMoney(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {/* 2. Anstehende Serien */}
        <div className="surface p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h3 className="font-semibold">Anstehend – nächste 30 Tage</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Einnahmen
              </div>
              {income.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Keine Serien fällig.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {income.map((r) => (
                    <li key={r.id} className="rounded-lg border p-2.5">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDate(r.next_run)}</span>
                        <span className="font-medium text-primary">{formatMoney(r.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Ausgaben
              </div>
              {outgo.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Keine Serien fällig.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {outgo.map((r) => (
                    <li key={r.id} className="rounded-lg border p-2.5">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDate(r.next_run)}</span>
                        <span className="font-medium text-orange-500 dark:text-orange-400">
                          {formatMoney(r.amount)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/wiederkehrend" className="text-primary hover:underline">
              Wiederkehrende Rechnungen
            </Link>
            <Link to="/ausgaben" className="text-primary hover:underline">
              Wiederkehrende Ausgaben
            </Link>
          </div>
        </div>
      </div>

    </section>
  );
}
