import { useMemo, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import {
  type PlanShift,
  ALL,
  type TimeEntry,
  type KalenderProject,
  isoDay,
  monthStart,
  type PlanForm,
  emptyForm,
} from "./shared";

import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";

export function useCalendarRange(input: {
  projectsProp: NonNullable<Parameters<typeof useEinsatzKalenderState>[0]["projects"]>;
}) {
  const { projectsProp } = input;
  const queryClient = useQueryClient();

  // Eigene Projektliste laden, damit das Objekt/Projekt-Dropdown immer gefüllt ist,
  // auch wenn die übergebene Liste leer oder noch nicht geladen ist.
  const { data: fetchedProjects = [], error: projectsError } = useQuery({
    queryKey: ["projects", "kalender-picker"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,city").order("name");
      if (error) throw error;
      return data as KalenderProject[];
    },
  });

  const projects = useMemo<KalenderProject[]>(() => {
    const map = new Map<string, KalenderProject>();
    for (const p of [...projectsProp, ...fetchedProjects]) if (p?.id) map.set(p.id, p);
    return [...map.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "de"));
  }, [projectsProp, fetchedProjects]);
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [filterEmployee, setFilterEmployee] = useState<string>(ALL);
  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [day, setDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<TimeEntry | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanShift | null>(null);

  const [form, setForm] = useState<PlanForm>(emptyForm);

  const first = monthStart(anchor);
  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [anchor]);

  const gridStart = useMemo(() => {
    if (view === "week") return weekStart;
    const d = new Date(first);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [first, weekStart, view]);

  const days = useMemo(
    () =>
      Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart, view],
  );

  const rangeFrom = isoDay(days[0]!);
  const rangeTo = isoDay(days[days.length - 1]!);

  const { data: allEntries = [], error: entriesError } = useQuery({
    queryKey: ["time_entries", "calendar", rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .gte("work_date", rangeFrom)
        .lte("work_date", rangeTo)
        .order("start_time", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  /** Zusätzlich zugeordnete Mitarbeiter (Team) je Einsatz. */
  const entryIds = useMemo(() => allEntries.map((e) => e.id).sort(), [allEntries]);
  const { data: teamRows = [], error: teamError } = useQuery({
    queryKey: ["time_entry_employees", "calendar", entryIds],
    enabled: entryIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entry_employees")
        .select("id,time_entry_id,employee_id")
        .in("time_entry_id", entryIds);
      if (error) throw error;
      return data;
    },
  });
  return {
    allEntries,
    day,
    days,
    detail,
    entriesError,
    filterEmployee,
    filterProject,
    first,
    form,
    planDetail,
    projects,
    projectsError,
    queryClient,
    rangeFrom,
    rangeTo,
    setAnchor,
    setDay,
    setDetail,
    setFilterEmployee,
    setFilterProject,
    setForm,
    setPlanDetail,
    setView,
    teamRows,
    view,
    weekStart,
  };
}
