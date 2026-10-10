import { useCallback, useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { serviceAddress, serviceAddressOrBilling } from "@/lib/maps";

import { ALL, type TimeEntry } from "./shared";

import type { TeamMember } from "./useEinsatzKalenderStateModel";
import type { useCalendarRange } from "./useCalendarRange";
import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";

export function useCalendarDirectory(input: {
  allEntries: ReturnType<typeof useCalendarRange>["allEntries"];
  employees: Parameters<typeof useEinsatzKalenderState>[0]["employees"];
  filterEmployee: ReturnType<typeof useCalendarRange>["filterEmployee"];
  filterProject: ReturnType<typeof useCalendarRange>["filterProject"];
  projects: ReturnType<typeof useCalendarRange>["projects"];
  teamRows: ReturnType<typeof useCalendarRange>["teamRows"];
}) {
  const { allEntries, employees, filterEmployee, filterProject, projects, teamRows } = input;
  const teamByEntry = useMemo(() => {
    const map = new Map<string, TeamMember[]>();
    for (const r of teamRows) {
      const list = map.get(r.time_entry_id) ?? [];
      list.push({
        rowId: r.id,
        employeeId: r.employee_id,
        name: employees.find((e) => e.id === r.employee_id)?.name ?? "Mitarbeiter",
      });
      map.set(r.time_entry_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return map;
  }, [teamRows, employees]);

  const teamOf = useCallback(
    (e: {
      id: string;
      employee_id?: string | null;
      employee_name?: string | null;
    }): TeamMember[] => {
      const list = teamByEntry.get(e.id) ?? [];
      if (list.length > 0) return list;
      return e.employee_id
        ? [{ rowId: "", employeeId: e.employee_id, name: e.employee_name || "Mitarbeiter" }]
        : [];
    },
    [teamByEntry],
  );

  const teamNames = useCallback(
    (e: TimeEntry) => {
      const names = teamOf(e).map((m) => m.name);
      return names.length > 0 ? names.join(" & ") : e.employee_name || "";
    },
    [teamOf],
  );

  /** Anzeige nach Mitarbeiter- und Projektfilter eingeschränkt. */
  const entries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          (filterEmployee === ALL || e.employee_id === filterEmployee) &&
          (filterProject === ALL || e.project_id === filterProject),
      ),
    [allEntries, filterEmployee, filterProject],
  );

  const visibleEmployees = useMemo(
    () => (filterEmployee === ALL ? employees : employees.filter((e) => e.id === filterEmployee)),
    [employees, filterEmployee],
  );

  /** Kundennamen für die Schnellansicht und den Export. */
  const { data: customers = [], error: customersError } = useQuery({
    queryKey: ["customers", "calendar-names"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id,name,company,address_line,postal_code,city,service_address_line,service_postal_code,service_city,service_note",
        );
      if (error) throw error;
      return data;
    },
  });

  const customerName = (id: string | null) => {
    if (!id) return "";
    const c = customers.find((x) => x.id === id);
    return c ? c.company || c.name : "";
  };

  /** Einsatzort des Kunden (falls gepflegt), sonst Rechnungsadresse. */
  const customerSite = (id: string | null) => {
    if (!id) return { address: "", note: "", own: false };
    const c = customers.find((x) => x.id === id);
    if (!c) return { address: "", note: "", own: false };
    const own = Boolean(serviceAddress(c));
    return {
      address: serviceAddressOrBilling(c),
      note: c.service_note ?? "",
      own,
    };
  };

  const projectName = useCallback(
    (id: string | null) => {
      if (!id) return "";
      return projects.find((x) => x.id === id)?.name || "";
    },
    [projects],
  );
  return {
    customerName,
    customerSite,
    customers,
    customersError,
    entries,
    projectName,
    teamByEntry,
    teamNames,
    teamOf,
    visibleEmployees,
  };
}
