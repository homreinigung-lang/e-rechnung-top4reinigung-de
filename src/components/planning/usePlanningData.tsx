import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";

import { normalizeDayHours, normalizeDayTimes, timeToHours, type DayTime } from "@/lib/planung";

import { WEEKS_PER_MONTH } from "@/lib/constants";

import {
  type Employee,
  type Project,
  type Customer,
  type GridObject,
  type Assignment,
  isoDay,
  mondayOf,
  addDays,
} from "./shared";

import type { useArbeitsplanungState } from "./useArbeitsplanungState";

export function usePlanningData(input: {
  initialPlan: Parameters<typeof useArbeitsplanungState>[0]["initialPlan"];
}) {
  const { initialPlan } = input;
  const queryClient = useQueryClient();
  const [seedEmployeeId, setSeedEmployeeId] = React.useState("");
  const [seedStartTime, setSeedStartTime] = React.useState("08:00");
  const [seedBreakMinutes, setSeedBreakMinutes] = React.useState("0");
  const [filter, setFilter] = React.useState("");
  const [assignEmployeeId, setAssignEmployeeId] = React.useState("");
  const [assignProjectId, setAssignProjectId] = React.useState("");
  const [quickAssign, setQuickAssign] = React.useState<{
    employeeId: string;
    projectId: string;
  } | null>(null);
  const [dragEmployeeId, setDragEmployeeId] = React.useState<string | null>(null);
  const [monday, setMonday] = React.useState(() => mondayOf(new Date()));
  const weekStart = isoDay(monday);
  const weekEnd = isoDay(addDays(monday, 6));

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["employees", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role,weekly_hours,user_id")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const { data: projects = [], error: projectsError } = useQuery({
    queryKey: ["projects", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,address_line,postal_code,status,customer_id")
        .order("name");
      if (error) throw error;
      return data as Project[];
    },
  });

  const { data: customers = [], error: customersError } = useQuery({
    queryKey: ["customers", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,company,city,address_line,postal_code")
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["project_assignments", "planung", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,project_id,employee_id,hours_per_week,day_hours,day_times,assignment_role,start_date,end_date",
        )
        .eq("start_date", weekStart);
      if (error) throw error;
      return data as Assignment[];
    },
  });

  const { data: absences = [], error: absencesError } = useQuery({
    queryKey: ["planning_absences", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id,employee_id,work_date,absence_reason,approval_status,entry_type")
        .eq("entry_type", "absence")
        .eq("approval_status", "approved")
        .gte("work_date", weekStart)
        .lte("work_date", weekEnd);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: release, isLoading: releaseLoading } = useQuery({
    queryKey: ["plan_release", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_releases")
        .select("id,week_start,released_at")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; week_start: string; released_at: string } | null;
    },
  });

  const releaseWeek = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("plan_releases").upsert(
        {
          user_id: uid,
          week_start: weekStart,
          week_end: weekEnd,
          released_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan_release"] });
      toast.success(`Woche freigegeben – Mitarbeitende wurden benachrichtigt.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawRelease = useMutation({
    mutationFn: async () => {
      if (!release) return;
      const { error } = await supabase.from("plan_releases").delete().eq("id", release.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan_release"] });
      toast.success("Freigabe zurückgenommen.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const objects = React.useMemo<GridObject[]>(() => {
    const linked = new Set(
      projects.map((p) => (p as Project & { customer_id?: string }).customer_id).filter(Boolean),
    );
    const fromCustomers: GridObject[] = customers
      .filter((c) => !linked.has(c.id))
      .map((c) => ({
        id: `c:${c.id}`,
        name: c.company || c.name,
        city: c.city,
        address_line: c.address_line,
        postal_code: c.postal_code,
        status: null,
        customerId: c.id,
        virtual: true,
      }));
    return [...projects, ...fromCustomers];
  }, [projects, customers]);

  const key = (e: string, p: string) => `${e}|${p}`;
  const map = React.useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of assignments) m.set(key(a.employee_id, a.project_id), a);
    return m;
  }, [assignments]);

  // Entwurf: eingegebene Zeiten bleiben lokal, bis „Speichern" gedrückt wird.
  const [draft, setDraft] = React.useState<Record<string, DayTime[]>>({});
  const [cellErrors, setCellErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setDraft({});
  }, [weekStart]);

  const savedTimes = (e: string, p: string) => {
    const a = map.get(key(e, p));
    return normalizeDayTimes(a?.day_times);
  };

  /** Fallback für Altbestand ohne Von-/Bis-Zeiten. */
  const savedFallbackHours = (e: string, p: string) => {
    const a = map.get(key(e, p));
    if (!a) return normalizeDayHours(null);
    const days = normalizeDayHours(a.day_hours);
    const total = days.reduce((s, n) => s + n, 0);
    if (total === 0 && Number(a.hours_per_week ?? 0) > 0) {
      const per = Number(a.hours_per_week) / 5;
      return [per, per, per, per, per, 0, 0];
    }
    return days;
  };

  const cellTimes = (e: string, p: string) => draft[key(e, p)] ?? savedTimes(e, p);

  const cellDayHours = (e: string, p: string) => {
    const fromTimes = cellTimes(e, p).map((t) => timeToHours(t));
    if (fromTimes.some((h) => h > 0)) return fromTimes;
    return draft[key(e, p)] ? fromTimes : savedFallbackHours(e, p);
  };

  const cellHours = (e: string, p: string) =>
    cellDayHours(e, p).reduce((s, n) => s + (Number(n) || 0), 0);

  function openAssignment(employeeId: string, projectId: string) {
    const employee = employees.find((item) => item.id === employeeId);
    const object = objects.find((item) => item.id === projectId);
    if (!employee || !object) {
      toast.error("Mitarbeiter oder Objekt wurde nicht gefunden.");
      return;
    }
    setQuickAssign({ employeeId, projectId });
  }

  function handleEmployeeDrop(projectId: string, event: React.DragEvent) {
    event.preventDefault();
    const employeeId = event.dataTransfer.getData("text/employee-id") || dragEmployeeId || "";
    setDragEmployeeId(null);
    if (!employeeId) return;
    openAssignment(employeeId, projectId);
  }

  const seedProject = initialPlan
    ? objects.find((object) => object.id === initialPlan.projectId)
    : undefined;
  const seedVisitsPerWeek = initialPlan ? initialPlan.visitsPerMonth / WEEKS_PER_MONTH : 0;
  const seedHoursPerVisit =
    initialPlan && initialPlan.visitsPerMonth > 0
      ? initialPlan.monthlyHours / initialPlan.visitsPerMonth
      : 0;
  return {
    absences,
    absencesError,
    assignEmployeeId,
    assignProjectId,
    assignmentsError,
    cellDayHours,
    cellErrors,
    cellHours,
    cellTimes,
    customers,
    customersError,
    draft,
    dragEmployeeId,
    employees,
    employeesError,
    filter,
    handleEmployeeDrop,
    key,
    map,
    monday,
    objects,
    openAssignment,
    projectsError,
    queryClient,
    quickAssign,
    release,
    releaseLoading,
    releaseWeek,
    savedTimes,
    seedBreakMinutes,
    seedEmployeeId,
    seedHoursPerVisit,
    seedProject,
    seedStartTime,
    seedVisitsPerWeek,
    setAssignEmployeeId,
    setAssignProjectId,
    setCellErrors,
    setDraft,
    setDragEmployeeId,
    setFilter,
    setMonday,
    setQuickAssign,
    setSeedBreakMinutes,
    setSeedEmployeeId,
    setSeedStartTime,
    weekEnd,
    weekStart,
    withdrawRelease,
  };
}
