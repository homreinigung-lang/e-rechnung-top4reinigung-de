import { useMemo, type DragEvent as ReactDragEvent } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { friendlyDbError } from "@/lib/db-errors";

import { isAbsence } from "@/lib/absence";
import { statusClasses } from "@/lib/einsatz-status";

import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";

import { type PlanShift, ALL, type TimeEntry, isoDay, serviceClasses } from "./shared";

import type { useCalendarDragDrop } from "./useCalendarDragDrop";
import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";
import type { useCalendarDirectory } from "./useCalendarDirectory";
import type { useCalendarRange } from "./useCalendarRange";
import type { useCalendarPlanning } from "./useCalendarPlanning";

export function useCalendarTeamActions(input: {
  addTeamMember: ReturnType<typeof useCalendarDragDrop>["addTeamMember"];
  drag: ReturnType<typeof useCalendarDragDrop>["drag"];
  employees: Parameters<typeof useEinsatzKalenderState>[0]["employees"];
  entries: ReturnType<typeof useCalendarDirectory>["entries"];
  filterEmployee: ReturnType<typeof useCalendarRange>["filterEmployee"];
  filterProject: ReturnType<typeof useCalendarRange>["filterProject"];
  isCompleted: ReturnType<typeof useCalendarDragDrop>["isCompleted"];
  projectName: ReturnType<typeof useCalendarDirectory>["projectName"];
  rangeFrom: ReturnType<typeof useCalendarRange>["rangeFrom"];
  rangeTo: ReturnType<typeof useCalendarRange>["rangeTo"];
  refresh: ReturnType<typeof useCalendarPlanning>["refresh"];
  removeTeamMember: ReturnType<typeof useCalendarDragDrop>["removeTeamMember"];
  setDrag: ReturnType<typeof useCalendarDragDrop>["setDrag"];
  setDropTarget: ReturnType<typeof useCalendarDragDrop>["setDropTarget"];
  setRepeatEntry: ReturnType<typeof useCalendarDragDrop>["setRepeatEntry"];
  teamByEntry: ReturnType<typeof useCalendarDirectory>["teamByEntry"];
  teamOf: ReturnType<typeof useCalendarDirectory>["teamOf"];
}) {
  const {
    addTeamMember,
    drag,
    employees,
    entries,
    filterEmployee,
    filterProject,
    isCompleted,
    projectName,
    rangeFrom,
    rangeTo,
    refresh,
    removeTeamMember,
    setDrag,
    setDropTarget,
    setRepeatEntry,
    teamByEntry,
    teamOf,
  } = input;
  const repeatTask = useMutation({
    mutationFn: async ({ source, dates }: { source: TimeEntry; dates: string[] }) => {
      if (dates.length === 0) throw new Error("Bitte mindestens einen Tag auswählen.");
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const rows = dates.map((work_date) => ({
        user_id: userId,
        employee_id: source.employee_id,
        employee_name: source.employee_name,
        customer_id: source.customer_id,
        project_id: source.project_id,
        location: source.location,
        note: source.note,
        start_time: source.start_time,
        end_time: source.end_time,
        break_minutes: source.break_minutes,
        hours: source.hours,
        hourly_rate: source.hourly_rate,
        entry_type: source.entry_type,
        absence_reason: source.absence_reason,
        service_category: source.service_category ?? "sonstiges",
        work_date,
        status: "active",
      }));
      const { data: created, error } = await supabase
        .from("time_entries")
        .insert(rows)
        .select("id");
      if (error) throw new Error(friendlyDbError(error, "Kopieren fehlgeschlagen."));

      // Zugeordnete Mitarbeiter mitkopieren
      const members = (teamByEntry.get(source.id) ?? []).map((m) => m.employeeId);
      if (source.employee_id && !members.includes(source.employee_id))
        members.push(source.employee_id);
      if (created && created.length > 0 && members.length > 0) {
        const links = created.flatMap((row) =>
          members.map((employee_id) => ({ time_entry_id: row.id, employee_id })),
        );
        const { error: linkError } = await supabase.from("time_entry_employees").insert(links);
        if (linkError)
          throw new Error(
            friendlyDbError(linkError, "Mitarbeiter konnten nicht mitkopiert werden."),
          );
      }
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} Einsatz/Einsätze angelegt`);
      setRepeatEntry(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entryDragProps = (e: TimeEntry) => {
    const locked = isCompleted(e);
    return {
      draggable: !locked,
      onDragStart: (ev: ReactDragEvent) => {
        if (locked) {
          ev.preventDefault();
          toast.info("Abgeschlossene Einsätze können nicht verschoben werden.");
          return;
        }
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", e.id);
        setDrag({ kind: "entry", id: e.id, employeeId: e.employee_id, date: e.work_date });
      },
      onDragEnd: () => {
        setDrag(null);
        setDropTarget(null);
      },
      // Mitarbeiter aus der Liste auf eine bestehende Aufgabe ziehen = zusätzlich zuordnen
      onDragOver: (ev: ReactDragEvent) => {
        if (drag?.kind !== "employee") return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = locked ? "none" : "copy";
      },
      onDrop: (ev: ReactDragEvent) => {
        if (drag?.kind !== "employee") return;
        ev.preventDefault();
        ev.stopPropagation();
        const employeeId = drag.employeeId;
        setDrag(null);
        setDropTarget(null);
        if (locked) {
          toast.info("Abgeschlossene Einsätze können nicht geändert werden.");
          return;
        }
        if (teamOf(e).some((m) => m.employeeId === employeeId)) return;
        addTeamMember.mutate({ id: e.id, employeeId });
      },
    };
  };

  const entryLockClasses = (e: TimeEntry) =>
    isCompleted(e) ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing";

  /** Farbgebung der Karte: Arbeitseinsätze nach Leistungsart, Abwesenheiten wie bisher. */
  const entryCardClasses = (e: TimeEntry, donePlan: unknown) => {
    if (donePlan) return "border-sky-600 bg-sky-600 text-white";
    if (isAbsence(e)) return statusClasses(e);
    return serviceClasses(e);
  };

  /** Mitarbeiter-Chips mit „x" zum Entfernen einzelner Mitarbeiter. */
  const TeamChips = ({ e }: { e: TimeEntry }) => {
    const members = teamOf(e);
    if (members.length === 0) return null;
    const locked = isCompleted(e);
    return (
      <div className="mt-0.5 flex flex-wrap gap-1">
        {members.map((m) => (
          <span
            key={m.employeeId}
            className="inline-flex items-center gap-0.5 rounded-full border bg-background/80 px-1.5 text-[10px] leading-4"
          >
            {m.name}
            {!locked && (
              <button
                type="button"
                aria-label={`${m.name} vom Einsatz entfernen`}
                title={`${m.name} vom Einsatz entfernen`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  removeTeamMember.mutate({ id: e.id, employeeId: m.employeeId });
                }}
                className="rounded-full px-0.5 text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    );
  };

  const byDay = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = map.get(e.work_date) ?? [];
      list.push(e);
      map.set(e.work_date, list);
    }
    return map;
  }, [entries]);

  /** Wochenplanung (Arbeitsplanung) für den sichtbaren Zeitraum. */
  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["project_assignments", "calendar", rangeFrom, rangeTo],
    queryFn: async () => {
      const from = new Date(`${rangeFrom}T12:00:00`);
      from.setDate(from.getDate() - 6);
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,employee_id,project_id,assignment_role,start_date,hours_per_week,day_hours,day_times",
        )
        .gte("start_date", isoDay(from))
        .lte("start_date", rangeTo);
      if (error) throw error;
      return data;
    },
  });

  /** Aus der Planung abgeleitete Schichten (Von–Bis) je Tag. */
  const planByDay = useMemo(() => {
    const map = new Map<string, PlanShift[]>();
    for (const a of assignments) {
      if (!a.start_date || !a.employee_id) continue;
      if (filterEmployee !== ALL && a.employee_id !== filterEmployee) continue;
      if (filterProject !== ALL && a.project_id !== filterProject) continue;
      const monday = new Date(`${a.start_date}T12:00:00`);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const hours = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
      const times = normalizeDayTimes(a.day_times);
      hours.forEach((h, i) => {
        if (!h || h <= 0) return;
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const key = isoDay(d);
        const list = map.get(key) ?? [];
        list.push({
          key: `${a.id}-${i}`,
          employeeId: a.employee_id!,
          employeeName: employees.find((e) => e.id === a.employee_id)?.name ?? "Mitarbeiter",
          projectId: a.project_id ?? null,
          projectName: projectName(a.project_id) || "Ohne Objekt",
          range: formatDayTime(times[i]),
          hours: h,
          start: times[i]?.start ?? "",
          end: times[i]?.end ?? "",
          breakMin: times[i]?.breakMin ?? 0,
          date: key,
        });
        map.set(key, list);
      });
    }
    for (const list of map.values()) {
      list.sort((x, y) => (x.range || "zz").localeCompare(y.range || "zz"));
    }
    return map;
  }, [assignments, employees, projectName, filterEmployee, filterProject]);
  return {
    TeamChips,
    assignmentsError,
    byDay,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    planByDay,
    repeatTask,
  };
}
