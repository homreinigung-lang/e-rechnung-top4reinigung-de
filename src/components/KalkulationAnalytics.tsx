import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const WEEKS_PER_MONTH = 4.33;

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${m}.${y?.slice(2)}`;
}

type ProjectStat = {
  id: string;
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  plannedHours: number;
  actualHours: number;
  efficiency: number;
};

/**
 * Professionelle Kennzahlen über alle Projekte: Wirtschaftlichkeit je Projekt,
 * Umsatzentwicklung und operative Effizienz. Die Daten werden live aus
 * Arbeitszeiten, Planung und Belegen gelesen (kein Zwischenspeicher).
 */
export function KalkulationAnalytics({ activeProjectId }: { activeProjectId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["kalkulation_analytics"],
    // Immer frische Daten – Kennzahlen dürfen nicht hinterherhinken.
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [projectsRes, entriesRes, assignmentsRes, docsRes] = await Promise.all([
        supabase.from("projects").select("id,name,hourly_rate,status").is("deleted_at", null),
        supabase
          .from("time_entries")
          .select("project_id,hours,hourly_rate,work_date,entry_type,approval_status"),
        supabase.from("project_assignments").select("project_id,hours_per_week"),
        supabase
          .from("documents")
          .select("type,status,issue_date,net_total,is_storno")
          .is("deleted_at", null),
      ]);
      if (projectsRes.error) throw projectsRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (docsRes.error) throw docsRes.error;
      return {
        projects: projectsRes.data ?? [],
        entries: entriesRes.data ?? [],
        assignments: assignmentsRes.data ?? [],
        docs: docsRes.data ?? [],
      };
    },
  });

  const stats = useMemo<ProjectStat[]>(() => {
    if (!data) return [];
    const entries = data.entries.filter(
      (e) =>
        (e.entry_type ?? "work") === "work" && (e.approval_status ?? "approved") !== "rejected",
    );
    return data.projects
      .map((p) => {
        const own = entries.filter((e) => e.project_id === p.id);
        const actualHours = round2(own.reduce((s, e) => s + Number(e.hours || 0), 0));
        const cost = round2(
          own.reduce((s, e) => s + Number(e.hours || 0) * Number(e.hourly_rate || 0), 0),
        );
        const revenue = round2(actualHours * Number(p.hourly_rate || 0));
        const plannedWeekly = data.assignments
          .filter((a) => a.project_id === p.id)
          .reduce((s, a) => s + Number(a.hours_per_week || 0), 0);
        const plannedHours = round2(plannedWeekly * WEEKS_PER_MONTH);
        const margin = round2(revenue - cost);
        return {
          id: p.id,
          name: p.name,
          revenue,
          cost,
          margin,
          marginPct: revenue > 0 ? Math.round((margin / revenue) * 100) : 0,
          plannedHours,
          actualHours,
          efficiency: plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0,
        };
      })
      .sort((a, b) => b.margin - a.margin);
  }, [data]);

  const trend = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    const docs = (data?.docs ?? []).filter((d) => d.type === "invoice" && d.status !== "draft");
    const entries = (data?.entries ?? []).filter(
      (e) =>
        (e.entry_type ?? "work") === "work" && (e.approval_status ?? "approved") !== "rejected",
    );
    return months.map((key) => ({
      month: monthLabel(key),
      umsatz: round2(
        docs
          .filter((d) => String(d.issue_date).startsWith(key))
          .reduce((s, d) => s + Number(d.net_total || 0), 0),
      ),
      kosten: round2(
        entries
          .filter((e) => String(e.work_date).startsWith(key))
          .reduce((s, e) => s + Number(e.hours || 0) * Number(e.hourly_rate || 0), 0),
      ),
    }));
  }, [data]);

  const totals = useMemo(() => {
    const revenue = round2(stats.reduce((s, p) => s + p.revenue, 0));
    const cost = round2(stats.reduce((s, p) => s + p.cost, 0));
    const planned = round2(stats.reduce((s, p) => s + p.plannedHours, 0));
    const actual = round2(stats.reduce((s, p) => s + p.actualHours, 0));
    return {
      revenue,
      cost,
      margin: round2(revenue - cost),
      marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      planned,
      actual,
      efficiency: planned > 0 ? Math.round((actual / planned) * 100) : 0,
      active: stats.filter((p) => p.actualHours > 0).length,
    };
  }, [stats]);

  const top = stats.slice(0, 8).map((p) => ({
    name: p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name,
    Deckungsbeitrag: p.margin,
  }));

  const kpis: [string, string, string][] = [
    ["Kalkulierter Umsatz", formatMoney(totals.revenue), `${totals.active} aktive Projekte`],
    ["Personalkosten", formatMoney(totals.cost), "aus erfassten Arbeitszeiten"],
    [
      "Deckungsbeitrag",
      formatMoney(totals.margin),
      `Marge ${formatNumber(totals.marginPct)} % über alle Projekte`,
    ],
    [
      "Effizienzquote",
      `${formatNumber(totals.efficiency)} %`,
      `${formatNumber(totals.actual)} Ist- zu ${formatNumber(totals.planned)} Soll-Std.`,
    ],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5" /> Wirtschaftlichkeit über alle Projekte
          </CardTitle>
          <CardDescription>
            Live-Auswertung aus Arbeitszeiten, Einsatzplanung und Belegen – ohne manuelle
            Aktualisierung.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map(([label, value, hint]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Umsatzentwicklung (6 Monate)</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} width={60} />
                    <Tooltip formatter={(v: number) => formatMoney(Number(v))} />
                    <Line
                      type="monotone"
                      dataKey="umsatz"
                      name="Umsatz"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="kosten"
                      name="Personalkosten"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Deckungsbeitrag je Projekt</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" fontSize={10} interval={0} angle={-20} height={44} />
                    <YAxis fontSize={11} width={60} />
                    <Tooltip formatter={(v: number) => formatMoney(Number(v))} />
                    <Bar dataKey="Deckungsbeitrag" fill="hsl(var(--primary))" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rentabilität je Projekt</CardTitle>
          <CardDescription>
            Umsatz, Kosten, Marge und Effizienz (Ist- zu Soll-Stunden) im direkten Vergleich.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Kennzahlen werden geladen …</p>
          ) : stats.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Noch keine Projekte erfasst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Projekt</th>
                    <th className="py-2 text-right font-medium">Umsatz</th>
                    <th className="py-2 text-right font-medium">Kosten</th>
                    <th className="py-2 text-right font-medium">Deckungsbeitrag</th>
                    <th className="py-2 text-right font-medium">Marge</th>
                    <th className="py-2 text-right font-medium">Ist / Soll Std.</th>
                    <th className="py-2 text-right font-medium">Effizienz</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b last:border-0 ${
                        p.id === activeProjectId ? "bg-muted/50" : ""
                      }`}
                    >
                      <td className="py-2 pr-2">{p.name}</td>
                      <td className="py-2 text-right">{formatMoney(p.revenue)}</td>
                      <td className="py-2 text-right">{formatMoney(p.cost)}</td>
                      <td className="py-2 text-right">{formatMoney(p.margin)}</td>
                      <td className="py-2 text-right">
                        <Badge variant={p.marginPct >= 20 ? "default" : "secondary"}>
                          {formatNumber(p.marginPct)} %
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(p.actualHours)} / {formatNumber(p.plannedHours)}
                      </td>
                      <td className="py-2 text-right">
                        {p.plannedHours > 0 ? `${formatNumber(p.efficiency)} %` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
