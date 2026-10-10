import type { SupabaseClient } from "@supabase/supabase-js";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { matchesTask } from "@/lib/employee-task";
import { useMyEmployee } from "@/lib/employee";

import { toast } from "sonner";

import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { absenceRangesFor, isEffective, absenceReason, isAbsence } from "@/lib/absence";

import { type DayTask } from "@/components/MeinEinsatzkalender";

import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/meine-zeiten");

export function useMeineZeitenState() {
  const search = routeApi.useSearch();
  const db = supabase as SupabaseClient;
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useMyEmployee();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    search["projekt"] ?? null,
  );
  const [selectedTask, setSelectedTask] = useState<DayTask | null>(null);

  const { data: entries = [], error: entriesError } = useQuery({
    queryKey: ["my_time_entries", me?.id],
    refetchInterval: 15_000,
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("employee_id", me!.id)
        .order("work_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [], error: projectsError } = useQuery({
    queryKey: ["my_projects", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,address_line,postal_code,customer_name");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        city: string;
        address_line: string;
        postal_code: string;
        customer_name: string;
      }[];
    },
  });

  const { data: releasedWeeks = [], error: releasedWeeksError } = useQuery({
    queryKey: ["plan_releases", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_releases").select("week_start");
      if (error) throw error;
      return (data ?? []).map((r) => String(r.week_start));
    },
  });

  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["my_assignments", me?.id, releasedWeeks.join(",")],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,project_id,assignment_role,hours_per_week,day_hours,day_times,start_date,end_date",
        )
        .eq("employee_id", me!.id);
      if (error) throw error;
      // Alle Planungen sind sichtbar; noch nicht freigegebene Wochen werden markiert.
      const released = new Set(releasedWeeks);
      return (data ?? []).map((a) => ({
        ...a,
        released: !a.start_date || released.has(String(a.start_date)),
      }));
    },
  });

  const { data: projectMaterials = [], error: projectMaterialsError } = useQuery({
    queryKey: ["my_project_materials", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("project_materials")
        .select("id,project_id,material_id,target_stock,object_stock");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        project_id: string;
        material_id: string;
        target_stock: number;
        object_stock: number;
      }[];
    },
  });

  const { data: materials = [], error: materialsError } = useQuery({
    queryKey: ["my_materials", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await db
        .from("materials")
        .select("id,name,unit")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  useEffect(() => {
    if (!search["projekt"] || !search["einsatz"] || !search["datum"]) return;
    const assignment = assignments.find(
      (a) => a.id === search["einsatz"] && a.project_id === search["projekt"],
    );
    if (!assignment) return;
    const date = search["datum"];
    const index = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const time = normalizeDayTimes(assignment.day_times)[index];
    const project = projects.find((p) => p.id === search["projekt"]);
    if (!project) return;
    setSelectedProjectId(search["projekt"]);
    setSelectedTask({
      key: `${assignment.id}-${index}`,
      assignmentId: assignment.id,
      date,
      projectId: search["projekt"],
      name: project?.name ?? "Objekt",
      address: "",
      hours:
        effectiveDayHours(assignment.day_hours, assignment.hours_per_week, assignment.day_times)[
          index
        ] ?? 0,
      range: formatDayTime(time),
      start: time?.start ?? "",
      end: time?.end ?? "",
      breakMin: time?.breakMin ?? 0,
      role: assignment.assignment_role,
      released: assignment.released,
      done: false,
      actual: "",
    });
  }, [search["projekt"], search["einsatz"], search["datum"], assignments, projects]);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name || "Projekt"]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "Projekt") : null);
  }, [projects]);

  const monthEntries = useMemo(
    () => entries.filter((e) => String(e.work_date).slice(0, 7) === month),
    [entries, month],
  );

  const workEntries = useMemo(() => monthEntries.filter((e) => !isAbsence(e)), [monthEntries]);

  const totalHours = useMemo(
    () => workEntries.reduce((s, e) => s + Number(e.hours || 0), 0),
    [workEntries],
  );

  /** Stunden nach Objekt / Projekt gruppiert. */
  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of workEntries) {
      const key = projectName(e.project_id as string | null) || e.location || "Ohne Objekt";
      map.set(key, (map.get(key) ?? 0) + Number(e.hours || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [workEntries, projectName]);

  /** Abwesenheiten des Jahres zu zusammenhängenden Zeiträumen zusammengefasst. */
  const absenceRanges = useMemo(() => {
    const year = month.slice(0, 4);
    return absenceRangesFor(entries.filter((e) => String(e.work_date).slice(0, 4) === year));
  }, [entries, month]);

  const absenceTotals = useMemo(() => {
    const year = month.slice(0, 4);
    let vacation = 0;
    let sick = 0;
    let other = 0;
    for (const e of entries) {
      if (!isAbsence(e) || !isEffective(e) || String(e.work_date).slice(0, 4) !== year) continue;
      const r = absenceReason(e);
      if (r === "vacation") vacation += 1;
      else if (r === "sick") sick += 1;
      else other += 1;
    }
    return { vacation, sick, other };
  }, [entries, month]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Einsatz bestätigen: überträgt die geplanten Zeiten des Tages als
   * tatsächliche Arbeitszeit in die Zeiterfassung (Ist-Stunden).
   */
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const confirmShift = useMutation({
    mutationFn: async (task: DayTask) => {
      if (!me) throw new Error("Kein Mitarbeiter");
      if (!(task.hours > 0)) throw new Error("Für diesen Tag sind keine Stunden geplant.");
      const project = projects.find((p) => p.id === task.projectId);
      if (!task.start || !task.end || task.end <= task.start)
        throw new Error(
          "Bitte die tatsächliche Start- und Endzeit über „Arbeitszeit erfassen“ eintragen.",
        );
      // Nur denselben Einsatz abgleichen; weitere Objekte und Zeitfenster sind erlaubt.
      const { data: existing, error: dupError } = await supabase
        .from("time_entries")
        .select("id,work_date,project_id,start_time,end_time,entry_type,approval_status")
        .eq("employee_id", me.id)
        .eq("work_date", task.date)
        .eq("entry_type", "work");
      if (dupError) throw dupError;
      if (existing?.some((entry) => matchesTask(entry, task))) {
        throw new Error("Für diesen Einsatz ist bereits eine Arbeitszeit erfasst.");
      }
      const { error } = await supabase.from("time_entries").insert({
        user_id: me.user_id,
        employee_id: me.id,
        employee_name: me.name,
        entry_type: "work",
        work_date: task.date,
        start_time: task.start || null,
        end_time: task.end || null,
        break_minutes: Math.max(0, Number(task.breakMin) || 0),
        hours: task.hours,
        hourly_rate: Number(me.hourly_rate ?? 0),
        project_id: task.projectId,
        location: project?.name ?? "",
        note: "Einsatz aus der Planung bestätigt",
        billed: false,
        approval_status: "pending",
        // Aufgabe gilt damit als erledigt – fließt in die Objekt-Historie ein
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onMutate: (task: DayTask) => setConfirmingKey(task.key),
    onSettled: () => setConfirmingKey(null),
    onSuccess: () => {
      toast.success("Einsatz bestätigt – Arbeitszeit übernommen");
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return {
      ready: false as const,
      fallback: <p className="text-sm text-muted-foreground">Wird geladen …</p>,
    };
  }

  if (!me) {
    return {
      ready: false as const,
      fallback: (
        <div className="surface max-w-xl p-6">
          <h1 className="text-2xl font-bold">Mitarbeiterbereich</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ihr Konto ist noch keinem Mitarbeiter zugeordnet. Bitte lassen Sie Ihre E-Mail-Adresse
            von der Verwaltung im Mitarbeiter-Stammsatz eintragen und melden Sie sich anschließend
            erneut an.
          </p>
        </div>
      ),
    };
  }

  return {
    ready: true as const,
    absenceRanges,
    absenceTotals,
    assignments,
    assignmentsError,
    byProject,
    confirmShift,
    confirmingKey,
    entries,
    entriesError,
    materials,
    materialsError,
    me,
    month,
    monthEntries,
    projectMaterials,
    projectMaterialsError,
    projectName,
    projects,
    projectsError,
    releasedWeeksError,
    remove,
    search,
    selectedProjectId,
    selectedTask,
    setMonth,
    setSelectedProjectId,
    setSelectedTask,
    totalHours,
  };
}
export type MeineZeitenState = Extract<ReturnType<typeof useMeineZeitenState>, { ready: true }>;
