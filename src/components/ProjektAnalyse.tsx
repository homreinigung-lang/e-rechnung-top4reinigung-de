import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, Clock, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjektUnterlagen } from "@/components/ProjektUnterlagen";
import {
  DEFAULT_PERFORMANCE_RATES,
  hoursPerVisit,
  type PerformanceRate,
} from "@/lib/leistungswerte";

type RoomRow = {
  id: string;
  name: string;
  area_sqm: number;
  confirmed: boolean;
  usage_type: string;
  floor_covering: string;
};

const WEEKS_PER_MONTH = 4.33;

export type KalkulationSnapshot = {
  /** Bezeichnung der Reinigungsart */
  typeLabel: string;
  areaSqm: number;
  /** Geschätzter Stundenbedarf pro Monat */
  monthlyHours: number;
  visitsPerMonth: number;
  positions: number;
  attachments: number;
  netTotal: number;
  confirmed: boolean;
};

type ProjectRow = {
  id: string;
  name: string;
  status: string;
  mode: string;
  customer_name: string;
  address_line: string;
  postal_code: string;
  city: string;
};

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function Bar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} %</span>
      </div>
      <Progress value={value} />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Live-Projektanalyse als integrierter Teil der Kalkulation:
 * Status, Fortschritt und geplante Mitarbeiterstunden zur aktuellen Berechnung.
 */
export function ProjektAnalyse({
  projectId,
  onProjectChange,
  snapshot,
}: {
  projectId: string | null;
  onProjectChange: (id: string | null) => void;
  snapshot: KalkulationSnapshot;
}) {
  const { data: projects = [] } = useQuery({
    queryKey: ["kalkulation_projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,status,mode,customer_name,address_line,postal_code,city")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const { data: rates = [] } = useQuery({
    queryKey: ["performance_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_rates")
        .select("id,label,usage_type,floor_covering,sqm_per_hour,active")
        .order("label");
      if (error) throw error;
      return (data ?? []) as PerformanceRate[];
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["kalkulation_project_detail", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const [rooms, lv, assignments, projectRow] = await Promise.all([
        supabase
          .from("project_rooms")
          .select("id,name,area_sqm,confirmed,usage_type,floor_covering")
          .eq("project_id", projectId!),
        supabase.from("project_lv_items").select("id,done,critical").eq("project_id", projectId!),
        supabase
          .from("project_assignments")
          .select("id,hours_per_week,employee_id,employees(name)")
          .eq("project_id", projectId!),
        supabase.from("projects").select("sqm_per_hour").eq("id", projectId!).maybeSingle(),
      ]);
      if (rooms.error) throw rooms.error;
      if (lv.error) throw lv.error;
      if (assignments.error) throw assignments.error;
      return {
        rooms: (rooms.data ?? []) as RoomRow[],
        lv: (lv.data ?? []) as { id: string; done: boolean; critical: boolean }[],
        assignments: (assignments.data ?? []) as {
          id: string;
          hours_per_week: number;
          employee_id: string;
          employees: { name: string } | null;
        }[],
        fallbackSqmPerHour: Number(projectRow.data?.sqm_per_hour ?? 0),
      };
    },
  });

  const rooms = detail?.rooms ?? [];
  const lv = detail?.lv ?? [];
  const assignments = detail?.assignments ?? [];

  const plannedMonthlyHours = assignments.reduce(
    (s, a) => s + Number(a.hours_per_week || 0) * WEEKS_PER_MONTH,
    0,
  );

  /**
   * Stundenbedarf aus den erfassten Räumen: Fläche je Raum geteilt durch den
   * passenden Leistungswert (Nutzungstyp/Bodenbelag). Ohne Treffer greift der
   * pauschale sqm_per_hour-Wert des Projekts als Fallback.
   */
  const roomBased = useMemo(() => {
    if (rooms.length === 0) return null;
    const usable = rates.length > 0 ? rates : (DEFAULT_PERFORMANCE_RATES as PerformanceRate[]);
    const { hours, matched, unmatched } = hoursPerVisit(
      rooms,
      usable,
      detail?.fallbackSqmPerHour ?? 0,
    );
    if (hours <= 0) return null;
    return { monthly: hours * snapshot.visitsPerMonth, matched, unmatched };
  }, [rooms, rates, detail?.fallbackSqmPerHour, snapshot.visitsPerMonth]);

  const effectiveMonthlyHours = roomBased ? roomBased.monthly : snapshot.monthlyHours;

  // Vollständigkeit der aktuellen Kalkulation (aktualisiert sich live)
  const readiness = useMemo(() => {
    const checks = [
      snapshot.areaSqm > 0 || snapshot.monthlyHours > 0,
      snapshot.positions > 0,
      snapshot.netTotal > 0,
      snapshot.attachments > 0 || rooms.length > 0,
      snapshot.confirmed,
    ];
    return pct(checks.filter(Boolean).length, checks.length);
  }, [snapshot, rooms.length]);

  const roomsProgress = pct(rooms.filter((r) => r.confirmed).length, rooms.length);
  const lvProgress = pct(lv.filter((i) => i.done).length, lv.length);
  const capacityProgress = pct(plannedMonthlyHours, effectiveMonthlyHours);


  const statusLabel = snapshot.confirmed
    ? "final bestätigt"
    : snapshot.netTotal > 0
      ? "in Bearbeitung"
      : "Entwurf";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" /> Projekt-Analyse
          </CardTitle>
          <CardDescription>
            Live-Status dieser Kalkulation inkl. Projektfortschritt und eingeplanter
            Mitarbeiterstunden.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={snapshot.confirmed ? "default" : "secondary"}>{statusLabel}</Badge>
          <Select
            value={projectId ?? "none"}
            onValueChange={(v) => onProjectChange(v === "none" ? null : v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Projekt verknüpfen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ohne Projektbezug</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Fläche</p>
            <p className="text-lg font-semibold">{formatNumber(snapshot.areaSqm)} m²</p>
            <p className="text-[11px] text-muted-foreground">
              {rooms.length > 0 ? `${rooms.length} Räume aus Analyse` : snapshot.typeLabel}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Stundenbedarf / Monat</p>
            <p className="text-lg font-semibold">{formatNumber(effectiveMonthlyHours)} Std.</p>
            <p className="text-[11px] text-muted-foreground">
              {formatNumber(snapshot.visitsPerMonth)} Einsätze pro Monat
              {roomBased
                ? ` · aus ${rooms.length} Räumen (${roomBased.matched} mit Leistungswert${
                    roomBased.unmatched > 0 ? `, ${roomBased.unmatched} pauschal` : ""
                  })`
                : ""}
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Geplante Mitarbeiterstunden</p>
            <p className="text-lg font-semibold">{formatNumber(plannedMonthlyHours)} Std.</p>
            <p className="text-[11px] text-muted-foreground">
              {assignments.length} Zuordnung(en) aus Arbeitsplanung
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Kalkuliert (netto)</p>
            <p className="text-lg font-semibold">{formatMoney(snapshot.netTotal)}</p>
            <p className="text-[11px] text-muted-foreground">
              {snapshot.positions} Position(en) · {snapshot.attachments} Datei(en)
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Bar
            label="Kalkulation vollständig"
            value={readiness}
            hint="Fläche/Stunden, Positionen, Preis, Unterlagen und finale Bestätigung"
          />
          <Bar
            label="Personaldeckung"
            value={capacityProgress}
            hint={
              snapshot.monthlyHours > 0
                ? `${formatNumber(plannedMonthlyHours)} von ${formatNumber(snapshot.monthlyHours)} Std. eingeplant`
                : "Noch kein Stundenbedarf berechnet"
            }
          />
          {project && (
            <>
              <Bar
                label="Räume geprüft"
                value={roomsProgress}
                hint={`${rooms.filter((r) => r.confirmed).length} von ${rooms.length} Räumen bestätigt`}
              />
              <Bar
                label="LV-Positionen erledigt"
                value={lvProgress}
                hint={`${lv.filter((i) => i.done).length} von ${lv.length} Positionen`}
              />
            </>
          )}
        </div>

        {project ? (
          <div className="grid gap-3 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    project.customer_name,
                    project.address_line,
                    `${project.postal_code} ${project.city}`.trim(),
                  ]
                    .filter((v) => v && v.trim())
                    .join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: {project.status || "offen"} ·{" "}
                  {project.mode === "tender" ? "Ausschreibungs-Analyse" : "Grundriss-Analyse"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">Eingesetzte Mitarbeitende</p>
                {assignments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Noch niemand eingeplant.</p>
                ) : (
                  <ul className="text-xs text-muted-foreground">
                    {assignments.map((a) => (
                      <li key={a.id} className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {a.employees?.name ?? "Mitarbeiter"} –{" "}
                        {formatNumber(Number(a.hours_per_week || 0))} Std./Woche
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Optional ein Projekt verknüpfen, um Räume, LV-Positionen und eingeplante
            Mitarbeiterstunden hier direkt mitlaufen zu lassen.
          </p>
        )}

        <ProjektUnterlagen projectId={projectId} />
      </CardContent>
    </Card>
  );
}
