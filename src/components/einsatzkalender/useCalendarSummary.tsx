import { useMemo } from "react";
import { isoWeek } from "@/lib/kw";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { firstError } from "@/components/LoadError";
import { isAbsence } from "@/lib/absence";

import { WEEKS_PER_MONTH } from "@/lib/constants";
import {
  type PlanShift,
  NO_PROJECT,
  ALL,
  type KalenderEmployee,
  isoDay,
  parseHm,
  hoursFromTimes,
  emptyForm,
} from "./shared";

import type { useCalendarTeamActions } from "./useCalendarTeamActions";
import type { useCalendarDirectory } from "./useCalendarDirectory";
import type { useCalendarRange } from "./useCalendarRange";
import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";
import type { useCalendarPlanning } from "./useCalendarPlanning";

export function useCalendarSummary(input: {
  assignmentsError: ReturnType<typeof useCalendarTeamActions>["assignmentsError"];
  byDay: ReturnType<typeof useCalendarTeamActions>["byDay"];
  customersError: ReturnType<typeof useCalendarDirectory>["customersError"];
  day: ReturnType<typeof useCalendarRange>["day"];
  days: ReturnType<typeof useCalendarRange>["days"];
  employees: Parameters<typeof useEinsatzKalenderState>[0]["employees"];
  entries: ReturnType<typeof useCalendarDirectory>["entries"];
  entriesError: ReturnType<typeof useCalendarRange>["entriesError"];
  filterEmployee: ReturnType<typeof useCalendarRange>["filterEmployee"];
  filterProject: ReturnType<typeof useCalendarRange>["filterProject"];
  first: ReturnType<typeof useCalendarRange>["first"];
  form: ReturnType<typeof useCalendarRange>["form"];
  planByDay: ReturnType<typeof useCalendarTeamActions>["planByDay"];
  projectsError: ReturnType<typeof useCalendarRange>["projectsError"];
  refresh: ReturnType<typeof useCalendarPlanning>["refresh"];
  setAnchor: ReturnType<typeof useCalendarRange>["setAnchor"];
  setDay: ReturnType<typeof useCalendarRange>["setDay"];
  setDetail: ReturnType<typeof useCalendarRange>["setDetail"];
  setForm: ReturnType<typeof useCalendarRange>["setForm"];
  setPlanDetail: ReturnType<typeof useCalendarRange>["setPlanDetail"];
  view: ReturnType<typeof useCalendarRange>["view"];
  weekStart: ReturnType<typeof useCalendarRange>["weekStart"];
}) {
  const {
    assignmentsError,
    byDay,
    customersError,
    day,
    days,
    employees,
    entries,
    entriesError,
    filterEmployee,
    filterProject,
    first,
    form,
    planByDay,
    projectsError,
    refresh,
    setAnchor,
    setDay,
    setDetail,
    setForm,
    setPlanDetail,
    view,
    weekStart,
  } = input;
  const { matchedPlanKeys, doneEntries } = useMemo(() => {
    const matched = new Set<string>();
    const done = new Map<string, PlanShift>();
    for (const [date, plans] of planByDay) {
      const dayList = (byDay.get(date) ?? []).filter((e) => !isAbsence(e) && e.employee_id);
      const used = new Set<string>();
      for (const p of plans) {
        const hit =
          dayList.find(
            (e) =>
              !used.has(e.id) &&
              e.employee_id === p.employeeId &&
              p.projectId &&
              e.project_id === p.projectId,
          ) ?? dayList.find((e) => !used.has(e.id) && e.employee_id === p.employeeId);
        if (!hit) continue;
        used.add(hit.id);
        matched.add(p.key);
        done.set(hit.id, p);
      }
    }
    return { matchedPlanKeys: matched, doneEntries: done };
  }, [planByDay, byDay]);

  /** Nur noch offene (nicht erfasste) Planungen eines Tages. */
  const openPlans = (key: string, employeeId?: string) =>
    (planByDay.get(key) ?? []).filter(
      (p) => !matchedPlanKeys.has(p.key) && (!employeeId || p.employeeId === employeeId),
    );

  const today = isoDay(new Date());

  const shift = (delta: number) => {
    if (view === "week") {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + delta * 7);
      setAnchor(d);
    } else {
      setAnchor(new Date(first.getFullYear(), first.getMonth() + delta, 1, 12));
    }
  };

  const periodLabel =
    view === "week"
      ? `KW ${isoWeek(weekStart)} · ${formatDate(isoDay(days[0]!))} – ${formatDate(isoDay(days[6]!))}`
      : first.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });

  /** Ist-Stunden (nur Arbeitseinsätze) je Mitarbeiter im sichtbaren Zeitraum. */
  const actualByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isAbsence(e) || !e.employee_id) continue;
      map.set(e.employee_id, (map.get(e.employee_id) ?? 0) + Number(e.hours ?? 0));
    }
    return map;
  }, [entries]);

  /** Soll-Stunden aus dem Vertrag: Woche = Wochenstunden, Monat = Wochenstunden × 52/12. */
  const plannedFor = (emp: KalenderEmployee) =>
    Number(emp.weekly_hours ?? 0) * (view === "week" ? 1 : WEEKS_PER_MONTH);

  const dayEntries = day ? (byDay.get(day) ?? []) : [];
  const isAbsent = form.entryType === "absence";
  const breakInput = Number(String(form.breakMinutes).replace(",", "."));
  const plannedHours = hoursFromTimes(
    form.start,
    form.end,
    Number.isFinite(breakInput) ? breakInput : 0,
  );
  const timesValid = parseHm(form.start) !== null && parseHm(form.end) !== null;

  const setEntryStatus = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { completed_at?: string | null; approval_status?: string };
    }) => {
      const { error } = await supabase.from("time_entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status aktualisiert");
      setDetail(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Geplante Schicht als erledigt übernehmen: Planzeit wird zur Ist-Arbeitszeit. */
  const confirmPlan = useMutation({
    mutationFn: async (p: PlanShift) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const emp = employees.find((e) => e.id === p.employeeId);
      // Doppelte Ist-Zeiten verhindern (Mehrfachklick oder bereits im Portal bestätigt)
      const { data: existing, error: dupError } = await supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", p.employeeId)
        .eq("work_date", p.date)
        .eq("entry_type", "work")
        .limit(1);
      if (dupError) throw dupError;
      if (existing && existing.length > 0) {
        throw new Error("Für diesen Tag ist bereits eine Arbeitszeit erfasst.");
      }
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        employee_id: p.employeeId,
        employee_name: emp?.name ?? p.employeeName,
        work_date: p.date,
        start_time: p.start || null,
        end_time: p.end || null,
        break_minutes: p.breakMin || 0,
        hours: Number(p.hours.toFixed(2)),
        hourly_rate: Number(emp?.hourly_rate ?? 0),
        project_id: p.projectId,
        location: p.projectName === "Ohne Objekt" ? "" : p.projectName,
        note: "",
        entry_type: "work",
        absence_reason: "",
        completed_at: new Date().toISOString(),
        approval_status: "approved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einsatz als erledigt übernommen");
      setPlanDetail(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDay = (key: string, employeeId?: string) => {
    const preset = employeeId ?? (filterEmployee !== ALL ? filterEmployee : "");
    setForm({
      ...emptyForm,
      employeeIds: preset ? [preset] : [],
      projectId: filterProject !== ALL ? filterProject : NO_PROJECT,
    });
    setDay(key);
  };

  const loadError = firstError(projectsError, entriesError, customersError, assignmentsError);
  return {
    actualByEmployee,
    confirmPlan,
    dayEntries,
    doneEntries,
    isAbsent,
    loadError,
    openDay,
    openPlans,
    periodLabel,
    plannedFor,
    plannedHours,
    setEntryStatus,
    shift,
    timesValid,
    today,
  };
}
