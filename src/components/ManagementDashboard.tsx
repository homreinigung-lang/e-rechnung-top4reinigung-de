import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatNumber } from "@/lib/format";
import { revenueForMonth } from "@/lib/object-controlling";
import {
  AlertTriangle,
  BriefcaseBusiness,
  ClipboardCheck,
  Clock3,
  HeartPulse,
  TrendingUp,
  Users,
} from "lucide-react";

const db = supabase as SupabaseClient;

function monthBounds(month: string) {
  const start = `${month}-01`;
  const date = new Date(`${start}T12:00:00`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

function absenceReason(value: unknown) {
  const reason = String(value ?? "").toLowerCase();
  if (reason.includes("krank") || reason.includes("sick")) return "sick";
  if (reason.includes("urlaub") || reason.includes("vacation")) return "vacation";
  return "other";
}

export function ManagementDashboard() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { start, end } = monthBounds(month);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(
    "de-DE-u-ca-gregory-nu-latn",
    { month: "long", year: "numeric" },
  );

  const { data } = useQuery({
    queryKey: ["management_dashboard", month],
    queryFn: async () => {
      const [projects, documents, expenses, timeEntries, employees, qmCases] = await Promise.all([
        supabase
          .from("projects")
          .select("id,name,customer_id,customer_name,city,status"),
        db
          .from("documents")
          .select("id,type,status,issue_date,service_period,net_total,total,is_storno,project_id,customer_id")
          .eq("type", "invoice")
          .is("deleted_at", null),
        db
          .from("expenses")
          .select("id,project_id,expense_date,net_amount")
          .is("deleted_at", null)
          .gte("expense_date", start)
          .lte("expense_date", end),
        supabase
          .from("time_entries")
          .select(
            "id,employee_id,project_id,work_date,hours,hourly_rate,entry_type,absence_reason,approval_status",
          )
          .gte("work_date", start)
          .lte("work_date", end),
        supabase
          .from("employees")
          .select("id,name,active,weekly_hours")
          .eq("active", true),
        db
          .from("qm_cases")
          .select("id,title,status,priority,due_date,project_id,customer_id,occurred_at")
          .order("created_at", { ascending: false }),
      ]);

      for (const result of [projects, documents, expenses, timeEntries, employees, qmCases]) {
        if (result.error) throw result.error;
      }

      return {
        projects: projects.data ?? [],
        documents: documents.data ?? [],
        expenses: expenses.data ?? [],
        timeEntries: timeEntries.data ?? [],
        employees: employees.data ?? [],
        qmCases: qmCases.data ?? [],
      };
    },
  });

  const projects = data?.projects ?? [];
  const documents = data?.documents ?? [];
  const expenses = data?.expenses ?? [];
  const timeEntries = data?.timeEntries ?? [];
  const employees = data?.employees ?? [];
  const qmCases = data?.qmCases ?? [];

  const customerProjectCount = new Map<string, number>();
  for (const project of projects) {
    if (!project.customer_id) continue;
    customerProjectCount.set(
      project.customer_id,
      (customerProjectCount.get(project.customer_id) ?? 0) + 1,
    );
  }

  const workEntries = timeEntries.filter(
    (entry) =>
      (entry.entry_type ?? "work") === "work" &&
      (entry.approval_status ?? "approved") !== "rejected",
  );
  const absenceEntries = timeEntries.filter(
    (entry) =>
      (entry.entry_type ?? "work") !== "work" &&
      (entry.approval_status ?? "approved") === "approved",
  );

  const projectRows = projects.map((project) => {
    const revenue = documents
      .filter((doc) => {
        if (String(doc.status ?? "") === "cancelled" || doc.is_storno) return false;
        const sameCustomer =
          Boolean(project.customer_id) && doc.customer_id === project.customer_id;
        const direct = doc.project_id === project.id && sameCustomer;
        const historical =
          !doc.project_id &&
          sameCustomer &&
          customerProjectCount.get(project.customer_id!) === 1;
        return direct || historical;
      })
      .reduce((sum, doc) => sum + revenueForMonth(doc, month), 0);

    const entries = workEntries.filter((entry) => entry.project_id === project.id);
    const hours = entries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0);
    const wageCosts = entries.reduce(
      (sum, entry) =>
        sum + Number(entry.hours ?? 0) * Number(entry.hourly_rate ?? 0),
      0,
    );
    const otherCosts = expenses
      .filter((expense) => expense.project_id === project.id)
      .reduce((sum, expense) => sum + Number(expense.net_amount ?? 0), 0);
    const costs = wageCosts + otherCosts;
    const contribution = revenue - costs;
    const margin = revenue > 0 ? (contribution / revenue) * 100 : null;

    return {
      id: project.id,
      name: project.name || "Ohne Namen",
      customer: project.customer_name || "",
      city: project.city || "",
      revenue,
      costs,
      contribution,
      margin,
      hours,
    };
  });

  const portfolioRevenue = projectRows.reduce((sum, row) => sum + row.revenue, 0);
  const portfolioCosts = projectRows.reduce((sum, row) => sum + row.costs, 0);
  const portfolioContribution = portfolioRevenue - portfolioCosts;
  const portfolioMargin =
    portfolioRevenue > 0 ? (portfolioContribution / portfolioRevenue) * 100 : null;
  const totalHours = workEntries.reduce((sum, entry) => sum + Number(entry.hours ?? 0), 0);

  const uniqueAbsenceDays = (reason: "sick" | "vacation") =>
    new Set(
      absenceEntries
        .filter((entry) => absenceReason(entry.absence_reason) === reason)
        .map((entry) => `${entry.employee_id ?? ""}|${entry.work_date}`),
    ).size;
  const sickDays = uniqueAbsenceDays("sick");
  const vacationDays = uniqueAbsenceDays("vacation");

  const today = new Date().toISOString().slice(0, 10);
  const openQm = qmCases.filter((item) => item.status !== "erledigt");
  const overdueQm = openQm.filter((item) => item.due_date && item.due_date < today);
  const highPriorityQm = openQm.filter((item) => item.priority === "hoch");

  const weakObjects = projectRows
    .filter(
      (row) =>
        (row.revenue > 0 && (row.margin ?? 0) < 10) ||
        (row.revenue === 0 && row.costs > 0),
    )
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 6);

  const metrics = [
    {
      label: "Objekt-Umsatz netto",
      value: formatMoney(portfolioRevenue),
      hint: monthLabel,
      icon: TrendingUp,
    },
    {
      label: "Deckungsbeitrag",
      value: formatMoney(portfolioContribution),
      hint:
        portfolioMargin == null
          ? "Keine Umsatzbasis"
          : `Marge ${formatNumber(portfolioMargin)} %`,
      icon: BriefcaseBusiness,
    },
    {
      label: "Ist-Stunden",
      value: `${formatNumber(totalHours)} Std.`,
      hint: `${employees.length} aktive Mitarbeiter`,
      icon: Clock3,
    },
    {
      label: "QM offen",
      value: String(openQm.length),
      hint: `${overdueQm.length} überfällig · ${highPriorityQm.length} hoch`,
      icon: ClipboardCheck,
    },
  ];

  return (
    <section aria-label="Management Cockpit" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Management Cockpit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Marge, Personal und Qualitätsrisiken in einer operativen Monatsansicht.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="management-month">Monat</Label>
          <Input
            id="management-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="surface p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{metric.label}</span>
              <metric.icon className="size-4 text-primary" />
            </div>
            <div className="mt-3 font-display text-2xl font-semibold">{metric.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{metric.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Handlungsbedarf · Objekte</h3>
              <p className="text-xs text-muted-foreground">
                Objekte unter 10 % Marge oder mit Kosten ohne Monatsumsatz.
              </p>
            </div>
            <Link to="/projekte" className="text-sm text-primary hover:underline">
              Alle Objekte
            </Link>
          </div>
          {weakObjects.length === 0 ? (
            <div className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
              Keine auffälligen Objekte im gewählten Monat.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Objekt</th>
                    <th className="px-3 py-2 text-right">Umsatz</th>
                    <th className="px-3 py-2 text-right">Kosten</th>
                    <th className="px-3 py-2 text-right">DB</th>
                    <th className="px-3 py-2 text-right">Marge</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {weakObjects.map((row) => (
                    <tr key={row.id}>
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
                      <td className="px-3 py-2 text-right">{formatMoney(row.costs)}</td>
                      <td
                        className={
                          row.contribution < 0
                            ? "px-3 py-2 text-right font-medium text-destructive"
                            : "px-3 py-2 text-right"
                        }
                      >
                        {formatMoney(row.contribution)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-destructive">
                        {row.margin == null ? "Keine Umsatzbasis" : `${formatNumber(row.margin)} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="surface space-y-4 p-5">
          <div>
            <h3 className="font-semibold">Personal & QM</h3>
            <p className="text-xs text-muted-foreground">{monthLabel}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="size-4" /> Aktive Mitarbeiter
              </div>
              <div className="mt-1 text-xl font-semibold">{employees.length}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HeartPulse className="size-4" /> Krankheit / Urlaub
              </div>
              <div className="mt-1 text-xl font-semibold">
                {sickDays} / {vacationDays}
              </div>
              <div className="text-xs text-muted-foreground">genehmigte Tage</div>
            </div>
          </div>

          {(overdueQm.length > 0 || highPriorityQm.length > 0) && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="size-4" /> QM benötigt Aufmerksamkeit
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {overdueQm.length} überfällig · {highPriorityQm.length} hohe Priorität
              </div>
            </div>
          )}

          <Link
            to="/qm-reklamationen"
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            QM / Reklamationen öffnen
          </Link>
          <Link
            to="/team"
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            Personalplanung öffnen
          </Link>
        </div>
      </div>
    </section>
  );
}
