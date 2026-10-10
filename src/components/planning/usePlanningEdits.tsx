import { useMutation } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";

import { normalizeDayTimes, timeToHours, EMPTY_DAY_TIME, type DayTime } from "@/lib/planung";

import { friendlyDbError } from "@/lib/db-errors";

import { type Employee, type GridObject, isoDay, addDays } from "./shared";

import type { usePlanningData } from "./usePlanningData";
import type { useArbeitsplanungState } from "./useArbeitsplanungState";

export function usePlanningEdits(input: {
  cellHours: ReturnType<typeof usePlanningData>["cellHours"];
  customers: ReturnType<typeof usePlanningData>["customers"];
  draft: ReturnType<typeof usePlanningData>["draft"];
  employees: ReturnType<typeof usePlanningData>["employees"];
  filter: ReturnType<typeof usePlanningData>["filter"];
  initialPlan: Parameters<typeof useArbeitsplanungState>[0]["initialPlan"];
  key: ReturnType<typeof usePlanningData>["key"];
  map: ReturnType<typeof usePlanningData>["map"];
  monday: ReturnType<typeof usePlanningData>["monday"];
  objects: ReturnType<typeof usePlanningData>["objects"];
  queryClient: ReturnType<typeof usePlanningData>["queryClient"];
  savedTimes: ReturnType<typeof usePlanningData>["savedTimes"];
  seedBreakMinutes: ReturnType<typeof usePlanningData>["seedBreakMinutes"];
  seedEmployeeId: ReturnType<typeof usePlanningData>["seedEmployeeId"];
  seedHoursPerVisit: ReturnType<typeof usePlanningData>["seedHoursPerVisit"];
  seedProject: ReturnType<typeof usePlanningData>["seedProject"];
  seedStartTime: ReturnType<typeof usePlanningData>["seedStartTime"];
  seedVisitsPerWeek: ReturnType<typeof usePlanningData>["seedVisitsPerWeek"];
  setCellErrors: ReturnType<typeof usePlanningData>["setCellErrors"];
  setDraft: ReturnType<typeof usePlanningData>["setDraft"];
  setFilter: ReturnType<typeof usePlanningData>["setFilter"];
  weekEnd: ReturnType<typeof usePlanningData>["weekEnd"];
  weekStart: ReturnType<typeof usePlanningData>["weekStart"];
}) {
  const {
    cellHours,
    customers,
    draft,
    employees,
    filter,
    initialPlan,
    key,
    map,
    monday,
    objects,
    queryClient,
    savedTimes,
    seedBreakMinutes,
    seedEmployeeId,
    seedHoursPerVisit,
    seedProject,
    seedStartTime,
    seedVisitsPerWeek,
    setCellErrors,
    setDraft,
    setFilter,
    weekEnd,
    weekStart,
  } = input;
  function applyCalculationPlan() {
    if (!initialPlan || !seedProject) {
      toast.error("Das verknüpfte Objekt wurde nicht gefunden.");
      return;
    }
    if (!seedEmployeeId) {
      toast.error("Bitte zuerst einen Mitarbeiter auswählen.");
      return;
    }
    if (seedVisitsPerWeek < 0.75) {
      toast.error(
        "Der Turnus liegt unter einem Einsatz pro Woche. Bitte die einzelnen Einsatzwochen manuell planen.",
      );
      return;
    }
    const employee = employees.find((item) => item.id === seedEmployeeId);
    if (!employee) {
      toast.error("Der ausgewählte Mitarbeiter wurde nicht gefunden.");
      return;
    }

    const visits = Math.min(7, Math.max(1, Math.round(seedVisitsPerWeek)));
    const breakMinutes = Math.max(0, Number(seedBreakMinutes) || 0);
    const [startHour = 8, startMinute = 0] = seedStartTime.split(":").map(Number);
    const startTotal = startHour * 60 + startMinute;
    const endTotal = startTotal + Math.round(seedHoursPerVisit * 60) + breakMinutes;
    const hh = String(Math.floor((endTotal % 1440) / 60)).padStart(2, "0");
    const mm = String(endTotal % 60).padStart(2, "0");
    const end = `${hh}:${mm}`;
    const times = Array.from({ length: 7 }, (_, index) =>
      index < visits
        ? { start: seedStartTime, end, breakMin: breakMinutes }
        : { ...EMPTY_DAY_TIME },
    );

    setDraft((current) => ({
      ...current,
      [key(employee.id, seedProject.id)]: times,
    }));
    setFilter(seedProject.name ?? "");
    toast.success(`Planungsvorschlag für ${employee.name} übernommen. Bitte prüfen und speichern.`);
  }

  const setDayTime = (e: string, p: string, index: number, patch: Partial<DayTime>) =>
    setDraft((d) => {
      const current = [...(d[key(e, p)] ?? savedTimes(e, p))];
      current[index] = { ...(current[index] ?? EMPTY_DAY_TIME), ...patch };
      return { ...d, [key(e, p)]: current };
    });

  /**
   * Ganze Woche auf einmal setzen: übernimmt eine Zeitvorlage auf die
   * gewünschten Wochentage (Mo–Fr oder Mo–So) bzw. leert alle Tage.
   */
  const applyWeekTimes = (e: string, p: string, template: DayTime, dayCount: number) =>
    setDraft((d) => {
      const current = [...(d[key(e, p)] ?? savedTimes(e, p))];
      const next = Array.from({ length: 7 }, (_, i) =>
        i < dayCount ? { ...template } : (current[i] ?? { ...EMPTY_DAY_TIME }),
      );
      return { ...d, [key(e, p)]: next };
    });

  const clearWeekTimes = (e: string, p: string) =>
    setDraft((d) => ({
      ...d,
      [key(e, p)]: Array.from({ length: 7 }, () => ({ ...EMPTY_DAY_TIME })),
    }));

  const copyPreviousWeek = useMutation({
    mutationFn: async () => {
      const previousStart = isoDay(addDays(monday, -7));
      const { data, error } = await supabase
        .from("project_assignments")
        .select("project_id,employee_id,day_times")
        .eq("start_date", previousStart);
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows) => {
      if (rows.length === 0) {
        toast.info("In der Vorwoche gibt es keine Planung zum Kopieren.");
        return;
      }
      setDraft((current) => {
        const next = { ...current };
        for (const row of rows) {
          const k = key(row.employee_id, row.project_id);
          if (!map.has(k) && !next[k]) {
            next[k] = normalizeDayTimes(row.day_times);
          }
        }
        return next;
      });
      toast.success("Vorwoche als Entwurf übernommen. Bitte prüfen und speichern.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirtyKeys = React.useMemo(
    () =>
      Object.keys(draft).filter((k) => {
        const [e, p] = k.split("|");
        return JSON.stringify(draft[k]) !== JSON.stringify(savedTimes(e!, p!));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, map],
  );

  async function persistCell(employee: Employee, object: GridObject, times: DayTime[]) {
    const days = times.map((t) => timeToHours(t));
    const hours = days.reduce((s, n) => s + (Number(n) || 0), 0);
    const existing = map.get(key(employee.id, object.id));
    if (hours <= 0) {
      if (existing) {
        const { error } = await supabase.from("project_assignments").delete().eq("id", existing.id);
        if (error) throw error;
      }
      return;
    }
    if (existing) {
      const { error } = await supabase
        .from("project_assignments")
        .update({ hours_per_week: hours, day_hours: days, day_times: times })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    let projectId = object.id;
    if (object.virtual) {
      const customer = customers.find((c) => c.id === object.customerId);
      const { data: created, error: pErr } = await supabase
        .from("projects")
        .insert({
          user_id: employee.user_id,
          name: object.name ?? "Objekt",
          mode: "grundriss",
          customer_id: object.customerId ?? null,
          customer_name: customer ? customer.company || customer.name : "",
          address_line: object.address_line ?? "",
          postal_code: object.postal_code ?? "",
          city: object.city ?? "",
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      projectId = created.id;
    }
    // Upsert anhand (Projekt, Mitarbeiter, Wochenstart): existiert für diese Woche
    // schon ein Eintrag, wird er aktualisiert – sonst neu angelegt.
    const { error } = await supabase.from("project_assignments").upsert(
      {
        project_id: projectId,
        employee_id: employee.id,
        user_id: employee.user_id,
        hours_per_week: hours,
        day_hours: days,
        day_times: times,
        start_date: weekStart,
        end_date: weekEnd,
      },
      { onConflict: "project_id,employee_id,start_date" },
    );
    if (error) throw error;
  }

  const saveAll = useMutation({
    mutationFn: async () => {
      // Jede Zelle einzeln speichern: Konflikte (z. B. Überschneidungen) dürfen
      // nicht den gesamten Wochenplan verwerfen.
      const failures: { key: string; label: string; message: string }[] = [];
      const savedKeys: string[] = [];
      for (const k of dirtyKeys) {
        const [eid, pid] = k.split("|");
        const employee = employees.find((e) => e.id === eid);
        const object = objects.find((o) => o.id === pid);
        if (!employee || !object) continue;
        try {
          await persistCell(employee, object, draft[k] ?? normalizeDayTimes(null));
          savedKeys.push(k);
        } catch (err) {
          failures.push({
            key: k,
            label: `${employee.name} – ${object.name || "Objekt"}`,
            message: friendlyDbError(err, "Zelle konnte nicht gespeichert werden."),
          });
        }
      }
      return { failures, savedKeys };
    },

    onSuccess: ({ failures, savedKeys }) => {
      // Nur erfolgreich gespeicherte Zellen aus dem Entwurf entfernen.
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of savedKeys) delete next[k];
        return next;
      });
      setCellErrors(Object.fromEntries(failures.map((f) => [f.key, f.message])));
      queryClient.invalidateQueries({ queryKey: ["project_assignments"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (failures.length === 0) {
        toast.success("Wochenplan gespeichert (Entwurf).");
      } else {
        toast.error(
          `${failures.length} von ${failures.length + savedKeys.length} Einträgen konnten nicht gespeichert werden.`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleProjects = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((p) =>
      `${p.name ?? ""} ${p.city ?? ""} ${p.address_line ?? ""}`.toLowerCase().includes(q),
    );
  }, [objects, filter]);

  const employeeTotal = (id: string) => objects.reduce((s, o) => s + cellHours(id, o.id), 0);

  const projectTotal = (id: string) => employees.reduce((s, e) => s + cellHours(e.id, id), 0);
  return {
    applyCalculationPlan,
    applyWeekTimes,
    clearWeekTimes,
    copyPreviousWeek,
    dirtyKeys,
    employeeTotal,
    projectTotal,
    saveAll,
    setDayTime,
    visibleProjects,
  };
}
