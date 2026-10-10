import { useState, type DragEvent as ReactDragEvent } from "react";

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { friendlyDbError } from "@/lib/db-errors";

import { ALL, type TimeEntry, hoursFromTimes, emptyForm } from "./shared";

import type { DragPayload } from "./useEinsatzKalenderStateModel";
import type { useCalendarRange } from "./useCalendarRange";
import type { useEinsatzKalenderState } from "./useEinsatzKalenderState";
import type { useCalendarPlanning } from "./useCalendarPlanning";
import type { useCalendarDirectory } from "./useCalendarDirectory";

export function useCalendarDragDrop(input: {
  allEntries: ReturnType<typeof useCalendarRange>["allEntries"];
  employees: Parameters<typeof useEinsatzKalenderState>[0]["employees"];
  filterProject: ReturnType<typeof useCalendarRange>["filterProject"];
  projects: ReturnType<typeof useCalendarRange>["projects"];
  refresh: ReturnType<typeof useCalendarPlanning>["refresh"];
  teamByEntry: ReturnType<typeof useCalendarDirectory>["teamByEntry"];
}) {
  const { allEntries, employees, filterProject, projects, refresh, teamByEntry } = input;
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [repeatEntry, setRepeatEntry] = useState<TimeEntry | null>(null);

  /** Abgeschlossene Einsätze sind gesperrt (kein Verschieben, kein Umbesetzen). */
  const isCompleted = (e: { status?: string | null }) => (e.status ?? "active") === "completed";

  /**
   * Einsatz auf einen anderen Tag (und optional Mitarbeiter) verschieben.
   * Der verschobene Einsatz gilt als neu geplante Aufgabe: Erledigt-Status,
   * Abrechnung, Fotos und Genehmigungsentscheidungen des Ursprungstages
   * werden dabei zurückgesetzt.
   */
  const moveEntry = useMutation({
    mutationFn: async ({
      id,
      workDate,
      employeeId,
    }: {
      id: string;
      workDate: string;
      employeeId?: string;
    }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht verschoben werden.");
      if (source?.billed)
        throw new Error(
          "Bereits abgerechnete Einsätze können nicht verschoben werden. Bitte die Abrechnung zuerst aufheben.",
        );
      const emp = employeeId ? employees.find((e) => e.id === employeeId) : null;
      const patch = {
        work_date: workDate,
        completed_at: null,
        billed: false,
        photo_paths: [],
        approval_status: "pending",
        decided_at: null,
        decided_by: null,
        decision_note: "",
        ...(employeeId ? { employee_id: employeeId } : {}),
        ...(emp ? { employee_name: emp.name } : {}),
      };

      const { error } = await supabase
        .from("time_entries")
        .update(patch)
        .eq("id", id)
        .neq("status", "completed");
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht verschoben werden."));

      // Teamzuordnung mit dem Haupt-Mitarbeiter synchron halten.
      if (employeeId && source?.employee_id && source.employee_id !== employeeId) {
        await supabase
          .from("time_entry_employees")
          .delete()
          .eq("time_entry_id", id)
          .eq("employee_id", source.employee_id);
        const others = teamByEntry.get(id) ?? [];
        if (others.some((m) => m.employeeId !== source.employee_id)) {
          await supabase
            .from("time_entry_employees")
            .upsert(
              { time_entry_id: id, employee_id: employeeId },
              { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
            );
        }
      }
    },
    onSuccess: () => {
      toast.success("Einsatz verschoben – als neue Aufgabe (offen) angelegt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Schnellzuweisung: Mitarbeiter per Drag & Drop auf einen Tag legen. */
  const quickAssign = useMutation({
    mutationFn: async ({ employeeId, workDate }: { employeeId: string; workDate: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("Mitarbeiter nicht gefunden");
      const project =
        filterProject !== ALL ? (projects.find((p) => p.id === filterProject) ?? null) : null;
      const start = emptyForm.start;
      const end = emptyForm.end;
      const breakMinutes = Number(emptyForm.breakMinutes);
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        employee_id: emp.id,
        employee_name: emp.name,
        work_date: workDate,
        start_time: start,
        end_time: end,
        break_minutes: breakMinutes,
        hours: Number(hoursFromTimes(start, end, breakMinutes).toFixed(2)),
        hourly_rate: Number(emp.hourly_rate ?? 0),
        project_id: project?.id ?? null,
        location: project?.name ?? "",
        note: "",
        entry_type: "work",
        absence_reason: "",
      });
      if (error) throw new Error(friendlyDbError(error, "Einsatz konnte nicht zugewiesen werden."));
    },
    onSuccess: () => {
      toast.success("Einsatz zugewiesen (08:00–16:00, Pause 30 Min.) – bei Bedarf anpassen");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Gemeinsame Drop-Logik für Monats- und Wochenansicht. */
  const handleDrop = (date: string, employeeId?: string) => {
    setDropTarget(null);
    const payload = drag;
    setDrag(null);
    if (!payload) return;
    if (payload.kind === "employee") {
      quickAssign.mutate({ employeeId: payload.employeeId, workDate: date });
      return;
    }
    const sameDay = payload.date === date;
    const sameEmployee = !employeeId || payload.employeeId === employeeId;
    if (sameDay && sameEmployee) return;
    moveEntry.mutate({ id: payload.id, workDate: date, ...(employeeId ? { employeeId } : {}) });
  };

  const dropProps = (dropKey: string, date: string, employeeId?: string) => ({
    onDragOver: (ev: ReactDragEvent) => {
      if (!drag) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = drag.kind === "employee" ? "copy" : "move";
      if (dropTarget !== dropKey) setDropTarget(dropKey);
    },
    onDragLeave: () => setDropTarget((c) => (c === dropKey ? null : c)),
    onDrop: (ev: ReactDragEvent) => {
      ev.preventDefault();
      handleDrop(date, employeeId);
    },
  });

  /** Mitarbeiter zusätzlich zu einer bestehenden Aufgabe hinzufügen. */
  const addTeamMember = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht geändert werden.");
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) throw new Error("Mitarbeiter nicht gefunden");
      // Primär-Mitarbeiter der Aufgabe ebenfalls als Zuordnung sichern.
      if (source?.employee_id) {
        await supabase
          .from("time_entry_employees")
          .upsert(
            { time_entry_id: id, employee_id: source.employee_id },
            { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
          );
      }
      const { error } = await supabase
        .from("time_entry_employees")
        .upsert(
          { time_entry_id: id, employee_id: employeeId },
          { onConflict: "time_entry_id,employee_id", ignoreDuplicates: true },
        );
      if (error)
        throw new Error(friendlyDbError(error, "Mitarbeiter konnte nicht hinzugefügt werden."));
      return emp.name;
    },
    onSuccess: (name) => {
      toast.success(`${name} zum Einsatz hinzugefügt`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Einen einzelnen Mitarbeiter von einer Aufgabe entfernen (Aufgabe bleibt bestehen). */
  const removeTeamMember = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const source = allEntries.find((e) => e.id === id);
      if (source && isCompleted(source))
        throw new Error("Abgeschlossene Einsätze können nicht geändert werden.");
      const { error } = await supabase
        .from("time_entry_employees")
        .delete()
        .eq("time_entry_id", id)
        .eq("employee_id", employeeId);
      if (error)
        throw new Error(friendlyDbError(error, "Mitarbeiter konnte nicht entfernt werden."));
    },
    onSuccess: () => {
      toast.success("Mitarbeiter vom Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    addTeamMember,
    drag,
    dropProps,
    dropTarget,
    isCompleted,
    removeTeamMember,
    repeatEntry,
    setDrag,
    setDropTarget,
    setRepeatEntry,
  };
}
