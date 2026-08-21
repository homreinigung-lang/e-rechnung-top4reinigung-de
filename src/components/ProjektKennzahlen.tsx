import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const WEEKS_PER_MONTH = 4.33;

/** Auf zwei Nachkommastellen gerundet – vermeidet Fließkomma-Artefakte. */
function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function monthPrefix(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

type EntryRow = {
  hours: number | null;
  hourly_rate: number | null;
  work_date: string;
  entry_type: string | null;
  approval_status: string | null;
  completed_at: string | null;
};

/**
 * Kennzahlen zum verknüpften Projekt (ausschließlich im Kalkulations-Bereich).
 * Basis sind erfasste, nicht abgelehnte Arbeitszeiten sowie die geplanten
 * Wochenstunden aus der Arbeitsplanung.
 */
export function ProjektKennzahlen({ projectId }: { projectId: string | null }) {
  const { data } = useQuery({
    queryKey: ["kalkulation_kennzahlen", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const [entriesRes, assignmentsRes, projectRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("hours,hourly_rate,work_date,entry_type,approval_status,completed_at")
          .eq("project_id", projectId!),
        supabase.from("project_assignments").select("hours_per_week").eq("project_id", projectId!),
        supabase.from("projects").select("hourly_rate").eq("id", projectId!).maybeSingle(),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      return {
        entries: (entriesRes.data ?? []) as EntryRow[],
        plannedWeekly: (assignmentsRes.data ?? []).reduce(
          (sum, a) => sum + Number(a.hours_per_week || 0),
          0,
        ),
        hourlyRate: Number(projectRes.data?.hourly_rate ?? 0),
      };
    },
  });

  if (!projectId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" /> Kennzahlen
          </CardTitle>
          <CardDescription>
            Ein Projekt verknüpfen, um Soll/Ist-Stunden, Personalkosten und Deckungsbeitrag zu
            sehen.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const entries = (data?.entries ?? []).filter(
    (e) => (e.entry_type ?? "work") === "work" && (e.approval_status ?? "approved") !== "rejected",
  );
  const prefix = monthPrefix();
  const monthEntries = entries.filter((e) => String(e.work_date).startsWith(prefix));

  const hoursOf = (rows: EntryRow[]) => round2(rows.reduce((s, e) => s + Number(e.hours || 0), 0));
  const costOf = (rows: EntryRow[]) =>
    round2(rows.reduce((s, e) => s + Number(e.hours || 0) * Number(e.hourly_rate || 0), 0));

  const istMonth = hoursOf(monthEntries);
  const istTotal = hoursOf(entries);
  const costMonth = costOf(monthEntries);
  const costTotal = costOf(entries);
  const sollMonth = round2(Number(data?.plannedWeekly ?? 0) * WEEKS_PER_MONTH);
  const utilization = sollMonth > 0 ? (istMonth / sollMonth) * 100 : 0;
  const rate = Number(data?.hourlyRate ?? 0);
  const revenueMonth = round2(istMonth * rate);
  const marginMonth = round2(revenueMonth - costMonth);
  const completed = entries.filter((e) => e.completed_at).length;

  const kpis: [string, string][] = [
    ["Soll-Stunden / Monat", `${formatNumber(sollMonth)} Std.`],
    ["Ist-Stunden / Monat", `${formatNumber(istMonth)} Std.`],
    ["Auslastung", `${formatNumber(Math.round(utilization))} %`],
    ["Ist-Stunden gesamt", `${formatNumber(istTotal)} Std.`],
    ["Personalkosten / Monat", formatMoney(costMonth)],
    ["Personalkosten gesamt", formatMoney(costTotal)],
    ["Umsatz / Monat (kalk.)", formatMoney(revenueMonth)],
    ["Deckungsbeitrag / Monat", formatMoney(marginMonth)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5" /> Kennzahlen & Smart Analytics
        </CardTitle>
        <CardDescription>
          Soll/Ist-Vergleich des laufenden Monats, Personalkosten und Deckungsbeitrag – {completed}{" "}
          abgeschlossene Einsätze erfasst.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${utilization > 110 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {sollMonth === 0
              ? "Für die Auslastung bitte in der Arbeitsplanung Wochenstunden hinterlegen."
              : utilization > 110
                ? "Achtung: Der Ist-Aufwand liegt deutlich über der Planung."
                : "Ist-Aufwand im Verhältnis zur geplanten Monatsleistung."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
