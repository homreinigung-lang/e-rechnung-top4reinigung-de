import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { formatDate } from "@/lib/format";

type Absence = {
  id: string;
  employee_id: string | null;
  work_date: string;
  absence_reason: string | null;
  created_at: string;
};

type Assignment = {
  id: string;
  project_id: string;
  employee_id: string;
  start_date: string | null;
  end_date: string | null;
  hours_per_week: number | null;
  day_hours: unknown;
  day_times: unknown;
};

type Employee = { id: string; name: string };
type Project = { id: string; name: string | null };

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekdayIndex(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

function absenceLabel(reason: string | null) {
  if (reason === "sick") return "Krankheit";
  if (reason === "vacation") return "Urlaub";
  return "Abwesenheit";
}

/**
 * Verwaltungswarnung für Einsätze, die mit genehmigten Abwesenheiten kollidieren.
 * Zeigt nur echte Konflikte: am Abwesenheitstag muss im Wochenplan ein Einsatz
 * mit positiven Stunden vorhanden sein.
 */
export function Vertretungswarnungen() {
  const queryClient = useQueryClient();
  const today = React.useMemo(() => isoDate(new Date()), []);
  const horizon = React.useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 45);
    return isoDate(date);
  }, []);

  const { data: absences = [] } = useQuery({
    queryKey: ["vertretungswarnungen", "absences", today, horizon],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,employee_id,work_date,absence_reason,created_at")
        .eq("entry_type", "absence")
        .eq("approval_status", "approved")
        .gte("work_date", today)
        .lte("work_date", horizon)
        .order("work_date");
      if (error) throw error;
      return (data ?? []) as Absence[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["vertretungswarnungen", "assignments", today, horizon],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select("id,project_id,employee_id,start_date,end_date,hours_per_week,day_hours,day_times")
        .not("start_date", "is", null)
        .lte("start_date", horizon)
        .gte("end_date", today);
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["vertretungswarnungen", "employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["vertretungswarnungen", "projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name");
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const channel = supabase
      .channel("owner-absence-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries" },
        (payload) => {
          const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
          if (row["entry_type"] !== "absence") return;
          queryClient.invalidateQueries({ queryKey: ["vertretungswarnungen"] });
          queryClient.invalidateQueries({ queryKey: ["planning_absences"] });
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            toast.warning("Abwesenheit geändert – Dienstplan auf Vertretung prüfen.");
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_assignments" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["vertretungswarnungen"] });
        },
      );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const employeeNames = React.useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );
  const projectNames = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.name || "Objekt"])),
    [projects],
  );

  const conflicts = React.useMemo(() => {
    return absences.flatMap((absence) => {
      if (!absence.employee_id) return [];
      const dayIndex = weekdayIndex(absence.work_date);
      return assignments
        .filter(
          (assignment) =>
            assignment.employee_id === absence.employee_id &&
            (!assignment.start_date || assignment.start_date <= absence.work_date) &&
            (!assignment.end_date || assignment.end_date >= absence.work_date),
        )
        .flatMap((assignment) => {
          const hours = effectiveDayHours(
            assignment.day_hours,
            assignment.hours_per_week,
            assignment.day_times,
          )[dayIndex] ?? 0;
          if (!(hours > 0)) return [];
          const time = normalizeDayTimes(assignment.day_times)[dayIndex];
          return [{
            key: `${absence.id}-${assignment.id}`,
            date: absence.work_date,
            reason: absenceLabel(absence.absence_reason),
            employee: employeeNames.get(absence.employee_id!) ?? "Mitarbeiter",
            project: projectNames.get(assignment.project_id) ?? "Objekt",
            time: formatDayTime(time),
            hours,
          }];
        });
    });
  }, [absences, assignments, employeeNames, projectNames]);

  if (conflicts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Vertretung nötig (${conflicts.length})`}
          title="Vertretung nötig"
        >
          <AlertTriangle className="size-5 text-amber-600" />
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
            {conflicts.length > 9 ? "9+" : conflicts.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Vertretung nötig</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {conflicts.slice(0, 8).map((conflict) => (
          <DropdownMenuItem key={conflict.key} asChild>
            <Link
              to="/team"
              search={{ tab: "dienstplan" }}
              className="flex cursor-pointer flex-col items-start gap-0.5"
            >
              <span className="text-sm font-medium">
                {conflict.employee} · {conflict.project}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(conflict.date)} · {conflict.reason} ·{" "}
                {conflict.time || `${conflict.hours.toFixed(2).replace(".", ",")} Std.`}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        {conflicts.length > 8 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/team" search={{ tab: "dienstplan" }}>
                + {conflicts.length - 8} weitere Konflikte im Dienstplan
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
