import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

import { BankDashboard } from "@/components/BankDashboard";
import { supabase } from "@/integrations/supabase/client";
import { addDays, formatDate, formatMoney, today } from "@/lib/format";
import { aggregateExpensesByCategory, isEuerIncome } from "@/lib/euer";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  TrendingUp,
} from "lucide-react";

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

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const INCOME_COLORS = ["#2563eb", "#60a5fa", "#93c5fd", "#bfdbfe"];
const EXPENSE_COLORS = ["#f97316", "#fb923c", "#fdba74", "#64748b", "#7c3aed", "#ca8a04"];
const num = (v: unknown) => Number(v ?? 0) || 0;

function isoDay(offsetDays = 0): string {
  return addDays(today(), offsetDays);
}

function chartTooltip(value: number) {
  return formatMoney(Number(value));
}

function monthIndex(value: string) {
  const month = Number(String(value).slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : -1;
}

/**
 * Kompakte Finanzübersicht der Startseite: Einnahmen, Ausgaben und Gewinn
 * in einem gemeinsamen Bereich plus Monatsverlauf und operative Finanzdaten.
 */
export function FinanzDashboard({ docs, expenses }: { docs: DocLite[]; expenses: ExpenseLite[] }) {
  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (let year = currentYear - 3; year <= currentYear + 1; year += 1) years.add(year);
    docs.forEach((doc) => {
      const year = Number(String(doc.issue_date).slice(0, 4));
      if (Number.isFinite(year)) years.add(year);
    });
    expenses.forEach((expense) => {
      const year = Number(String(expense.expense_date).slice(0, 4));
      if (Number.isFinite(year)) years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [currentYear, docs, expenses]);

  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");
  const [selectedQuarter, setSelectedQuarter] = useState<number | "all">("all");
  const yearPrefix = String(year);

  const invoices = useMemo(
    () => docs.filter((d) => isEuerIncome(d as unknown as Record<string, unknown>)),
    [docs],
  );

  const yearInvoices = useMemo(
    () => invoices.filter((d) => String(d.issue_date).startsWith(yearPrefix)),
    [invoices, yearPrefix],
  );
  const yearExpenses = useMemo(
    () => expenses.filter((e) => String(e.expense_date).startsWith(yearPrefix)),
    [expenses, yearPrefix],
  );

  const monthly = useMemo(
    () =>
      MONTHS.map((label, index) => {
        const prefix = `${year}-${String(index + 1).padStart(2, "0")}`;
        const einnahmen = yearInvoices
          .filter((d) => String(d.issue_date).startsWith(prefix))
          .reduce((sum, d) => sum + num(d.net_total ?? d.total), 0);
        const ausgaben = yearExpenses
          .filter((e) => String(e.expense_date).startsWith(prefix))
          .reduce((sum, e) => sum + num(e.net_amount), 0);
        return { label, monthIndex: index, einnahmen, ausgaben, gewinn: einnahmen - ausgaben };
      }),
    [year, yearExpenses, yearInvoices],
  );

  const periodInvoices = useMemo(() => {
    if (selectedMonth !== "all") {
      return yearInvoices.filter((d) => monthIndex(d.issue_date) === selectedMonth);
    }
    if (selectedQuarter !== "all") {
      const start = (selectedQuarter - 1) * 3;
      return yearInvoices.filter((d) => {
        const index = monthIndex(d.issue_date);
        return index >= start && index < start + 3;
      });
    }
    return yearInvoices;
  }, [selectedMonth, selectedQuarter, yearInvoices]);

  const periodExpenses = useMemo(() => {
    if (selectedMonth !== "all") {
      return yearExpenses.filter((e) => monthIndex(e.expense_date) === selectedMonth);
    }
    if (selectedQuarter !== "all") {
      const start = (selectedQuarter - 1) * 3;
      return yearExpenses.filter((e) => {
        const index = monthIndex(e.expense_date);
        return index >= start && index < start + 3;
      });
    }
    return yearExpenses;
  }, [selectedMonth, selectedQuarter, yearExpenses]);

  const visibleMonthly = useMemo(() => {
    if (selectedMonth !== "all") return monthly.filter((row) => row.monthIndex === selectedMonth);
    if (selectedQuarter !== "all") {
      const start = (selectedQuarter - 1) * 3;
      return monthly.filter((row) => row.monthIndex >= start && row.monthIndex < start + 3);
    }
    return monthly;
  }, [monthly, selectedMonth, selectedQuarter]);

  const incomeTotal = periodInvoices.reduce((sum, d) => sum + num(d.net_total ?? d.total), 0);
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + num(e.net_amount), 0);
  const profit = incomeTotal - expenseTotal;

  const periodLabel =
    selectedMonth !== "all"
      ? `${MONTHS[selectedMonth]} ${year}`
      : selectedQuarter !== "all"
        ? `Q${selectedQuarter} ${year}`
        : String(year);

  const incomeBreakdown = useMemo(() => {
    if (selectedMonth !== "all") {
      return [{ name: MONTHS[selectedMonth]!, value: incomeTotal, color: INCOME_COLORS[0]! }];
    }
    if (selectedQuarter !== "all") {
      const start = (selectedQuarter - 1) * 3;
      return monthly.slice(start, start + 3).map((row, index) => ({
        name: row.label,
        value: row.einnahmen,
        color: INCOME_COLORS[index]!,
      }));
    }
    return [0, 1, 2, 3].map((quarter) => ({
      name: `Q${quarter + 1}`,
      value: monthly
        .slice(quarter * 3, quarter * 3 + 3)
        .reduce((sum, row) => sum + row.einnahmen, 0),
      color: INCOME_COLORS[quarter]!,
    }));
  }, [incomeTotal, monthly, selectedMonth, selectedQuarter]);

  const categories = useMemo(
    () =>
      aggregateExpensesByCategory(periodExpenses as unknown as Record<string, unknown>[])
        .map((category, index) => ({
          name: category.category,
          value: category.net,
          color: EXPENSE_COLORS[index % EXPENSE_COLORS.length]!,
        }))
        .filter((category) => category.value > 0),
    [periodExpenses],
  );

  const until = isoDay(30);
  const { data: upcoming } = useQuery({
    queryKey: ["finanz_dashboard_serien"],
    queryFn: async () => {
      const [inv, exp] = await Promise.all([
        supabase
          .from("recurring_invoices")
          .select("id, title, next_run, active, documents:template_document_id (total)")
          .eq("active", true)
          .order("next_run"),
        supabase
          .from("recurring_expenses")
          .select("id, title, supplier, next_run, active, gross_amount")
          .eq("active", true)
          .order("next_run"),
      ]);
      if (inv.error) throw inv.error;
      if (exp.error) throw exp.error;
      return {
        income: (inv.data ?? []).map((row) => ({
          id: row.id,
          title: row.title || "Wiederkehrende Rechnung",
          next_run: String(row.next_run),
          amount: num((row.documents as { total?: number } | null)?.total),
        })),
        outgo: (exp.data ?? []).map((row) => ({
          id: row.id,
          title: row.title || row.supplier || "Wiederkehrende Ausgabe",
          next_run: String(row.next_run),
          amount: num(row.gross_amount),
        })),
      };
    },
  });

  const pick = (rows: { id: string; title: string; next_run: string; amount: number }[]) => {
    const inWindow = rows.filter((row) => row.next_run <= until);
    return (inWindow.length > 0 ? inWindow : rows).slice(0, 3);
  };
  const upcomingIncome = pick(upcoming?.income ?? []);
  const upcomingOutgo = pick(upcoming?.outgo ?? []);

  return (
    <section aria-label="Finanzübersicht" className="space-y-4">
      <div className="surface overflow-hidden p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined className="size-5 text-primary" />
              <h2 className="text-xl font-semibold">Finanzübersicht</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ihre wichtigsten Kennzahlen für {periodLabel} auf einen Blick.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="finance-year">Jahr</label>
            <select
              id="finance-year"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-9 rounded-lg border bg-background px-3 text-sm font-medium"
            >
              {availableYears.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>

            <label className="sr-only" htmlFor="finance-month">Monat</label>
            <select
              id="finance-month"
              value={selectedMonth}
              onChange={(event) => {
                const value = event.target.value === "all" ? "all" : Number(event.target.value);
                setSelectedMonth(value);
                if (value !== "all") setSelectedQuarter("all");
              }}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">Alle Monate</option>
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>

            <label className="sr-only" htmlFor="finance-quarter">Quartal</label>
            <select
              id="finance-quarter"
              value={selectedQuarter}
              onChange={(event) => {
                const value = event.target.value === "all" ? "all" : Number(event.target.value);
                setSelectedQuarter(value);
                if (value !== "all") setSelectedMonth("all");
              }}
              className="h-9 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">Alle Quartale</option>
              {[1, 2, 3, 4].map((quarter) => (
                <option key={quarter} value={quarter}>Q{quarter}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpRight className="size-4 text-blue-600" /> Einnahmen
            </div>
            <div className="mt-3 font-display text-3xl font-semibold text-blue-600">
              {formatMoney(incomeTotal)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{periodInvoices.length} Rechnungen · netto</p>
            <div className="mt-4 grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
              <div className="h-28 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={incomeBreakdown} dataKey="value" innerRadius={31} outerRadius={48} paddingAngle={2}>
                      {incomeBreakdown.map((item) => <Cell key={item.name} fill={item.color} />)}
                    </Pie>
                    <Tooltip formatter={chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 space-y-1.5 text-xs">
                {incomeBreakdown.map((item) => (
                  <li key={item.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-muted-foreground">{item.name}</span>
                    </span>
                    <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(item.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ArrowDownRight className="size-4 text-orange-500" /> Ausgaben
            </div>
            <div className="mt-3 font-display text-3xl font-semibold text-orange-500">
              {formatMoney(expenseTotal)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{periodExpenses.length} Belege · netto</p>
            {categories.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Noch keine Ausgaben erfasst.</p>
            ) : (
              <div className="mt-4 grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div className="h-28 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categories} dataKey="value" innerRadius={31} outerRadius={48} paddingAngle={2}>
                        {categories.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip formatter={chartTooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 space-y-1.5 text-[11px] sm:text-xs">
                  {categories.slice(0, 5).map((item) => (
                    <li key={item.name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-muted-foreground" title={item.name}>{item.name}</span>
                      </span>
                      <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(item.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-emerald-600" /> Gewinn
            </div>
            <div className={`mt-3 font-display text-3xl font-semibold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {formatMoney(profit)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Einnahmen abzüglich Ausgaben · netto</p>
            <div className="mt-5 h-32 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleMonthly} margin={{ top: 4, right: 6, left: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis hide />
                  <Tooltip formatter={chartTooltip} />
                  <Line type="monotone" dataKey="gewinn" name="Gewinn" stroke={profit >= 0 ? "#16a34a" : "#dc2626"} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Einnahmen / Ausgaben / Gewinn – Monatsverlauf</h3>
            <p className="mt-1 text-xs text-muted-foreground">Entwicklung Ihrer Finanzen für {periodLabel} (netto).</p>
          </div>
          <CircleDollarSign className="size-5 text-primary" />
        </div>
        <div className="mt-4 h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visibleMonthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={58} tickFormatter={(value: number) => Math.round(value).toLocaleString("de-DE")} />
              <Tooltip formatter={chartTooltip} />
              <Legend />
              <Bar dataKey="einnahmen" name="Einnahmen" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ausgaben" name="Ausgaben" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gewinn" name="Gewinn" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BankDashboard docs={docs} />

        <div className="surface p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            <h3 className="font-semibold">Anstehend – nächste 30 Tage</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <UpcomingList title="Einnahmen" rows={upcomingIncome} accent="text-primary" />
            <UpcomingList title="Ausgaben" rows={upcomingOutgo} accent="text-orange-500" />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm">
            <Link to="/wiederkehrend" className="text-primary hover:underline">Wiederkehrende Rechnungen</Link>
            <Link to="/ausgaben" className="text-primary hover:underline">Wiederkehrende Ausgaben</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function UpcomingList({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: { id: string; title: string; next_run: string; amount: number }[];
  accent: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Keine Serien fällig.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border p-3">
              <div className="truncate text-sm font-medium">{row.title}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{formatDate(row.next_run)}</span>
                <span className={`font-medium ${accent}`}>{formatMoney(row.amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
