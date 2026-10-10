import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { friendlyDbError } from "@/lib/db-errors";

import { absenceLabel, absenceReason } from "@/lib/absence";

import {
  NO_PROJECT,
  parseHm,
  minutesToHm,
  hoursFromTimes,
  type PlanForm,
  emptyForm,
} from "./shared";

import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";
import type { useCalendarRange } from "./useCalendarRange";

export function useCalendarPlanning(input: {
  employees: Parameters<typeof useEinsatzKalenderState>[0]["employees"];
  projects: ReturnType<typeof useCalendarRange>["projects"];
  queryClient: ReturnType<typeof useCalendarRange>["queryClient"];
  setDay: ReturnType<typeof useCalendarRange>["setDay"];
  setForm: ReturnType<typeof useCalendarRange>["setForm"];
}) {
  const { employees, projects, queryClient, setDay, setForm } = input;
  const printPlan = () => {
    const style = document.createElement("style");
    style.id = "kalender-print-style";
    style.textContent = `@media print{
      @page{size:A4 landscape;margin:10mm;}
      body *{visibility:hidden !important;}
      #einsatz-kalender-print,#einsatz-kalender-print *{visibility:visible !important;}
      #einsatz-kalender-print{position:absolute !important;left:0;top:0;width:100%;box-shadow:none !important;border:none !important;padding:0 !important;}
      #einsatz-kalender-print .kalender-no-print{display:none !important;}
      #einsatz-kalender-print .overflow-x-auto{overflow:visible !important;}
      #einsatz-kalender-print [class*="min-w-"]{min-width:0 !important;}
      *{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
    }`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 3000);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["time_entries"] });
    queryClient.invalidateQueries({ queryKey: ["time_entry_employees"] });
  };

  const createPlan = useMutation({
    mutationFn: async (values: PlanForm & { workDate: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const selected = employees.filter((e) => values.employeeIds.includes(e.id));
      if (selected.length === 0) throw new Error("Bitte mindestens einen Mitarbeiter wählen.");
      const absence = values.entryType === "absence";
      const rawBreak = Number(String(values.breakMinutes).replace(",", "."));
      const breakMinutes = absence || !Number.isFinite(rawBreak) ? 0 : Math.max(0, rawBreak);
      const startMin = parseHm(values.start);
      const endMin = parseHm(values.end);
      if (!absence && (startMin === null || endMin === null))
        throw new Error("Bitte Start- und Endzeit im Format HH:MM eintragen.");
      const hours = absence ? 0 : hoursFromTimes(values.start, values.end, breakMinutes);
      if (!absence && !(hours > 0))
        throw new Error("Die geplante Dauer muss größer als 0 Stunden sein.");
      // Über Mitternacht wird nur bei plausibler Schichtlänge gerechnet –
      // sonst ist es fast immer ein Zahlendreher (z. B. 08:00–07:00).
      if (!absence && endMin! <= startMin! && hours > 12)
        throw new Error(
          "Endzeit liegt vor der Startzeit. Für Nachtschichten sind maximal 12 Stunden möglich – bitte Zeiten prüfen.",
        );
      const locText = values.location.trim();
      const project = absence
        ? null
        : projects.find((p) => p.id === values.projectId && values.projectId !== NO_PROJECT) ||
          projects.find((p) => (p.name || "").trim().toLowerCase() === locText.toLowerCase()) ||
          null;

      const rows = selected.map((employee) => ({
        user_id: userId,
        employee_id: employee.id,
        employee_name: employee.name,
        work_date: values.workDate,
        start_time: absence ? null : minutesToHm(startMin!),
        end_time: absence ? null : minutesToHm(endMin!),
        break_minutes: breakMinutes,
        hours: Number(hours.toFixed(2)),

        hourly_rate: Number(employee.hourly_rate ?? 0),
        project_id: project?.id ?? null,
        customer_id:
          !absence && values.customerId && values.customerId !== NO_PROJECT
            ? values.customerId
            : null,
        location: absence ? absenceLabel(values.absenceReason) : locText || project?.name || "",

        note: values.note.trim(),
        entry_type: values.entryType,
        absence_reason: absence ? values.absenceReason : "",
        service_category: absence ? "sonstiges" : values.serviceCategory,
      }));

      const { error } = await supabase.from("time_entries").insert(rows);
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht geplant werden."));
      return rows.length;
    },
    onSuccess: (count, values) => {
      const n = count ?? 1;
      toast.success(
        values.entryType === "absence"
          ? `Abwesenheit für ${n} Mitarbeiter eingetragen`
          : `Einsatz für ${n} Mitarbeiter geplant`,
      );

      setDay(null);
      setForm(emptyForm);

      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error)
        throw new Error(
          friendlyDbError(
            error,
            'Einsatz konnte nicht gelöscht werden. Erledigte Einsätze bitte zuerst über "Erledigt zurücknehmen" öffnen.',
          ),
        );
    },
    onSuccess: () => {
      toast.success("Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { createPlan, printPlan, refresh, removePlan };
}
