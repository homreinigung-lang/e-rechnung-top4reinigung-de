import { useCalendarRange } from "./useCalendarRange";
import { useCalendarDirectory } from "./useCalendarDirectory";
import { useCalendarPlanning } from "./useCalendarPlanning";
import { useCalendarDragDrop } from "./useCalendarDragDrop";
import { useCalendarTeamActions } from "./useCalendarTeamActions";
import { useCalendarSummary } from "./useCalendarSummary";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { statusLabel } from "@/lib/einsatz-status";
import { saveFile } from "@/lib/download";

import { type KalenderEmployee, type KalenderProject } from "./shared";

export function useEinsatzKalenderState({
  employees,
  projects: projectsProp = [],
}: {
  employees: KalenderEmployee[];
  projects?: KalenderProject[];
}) {
  const {
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
  } = useCalendarRange({ projectsProp });

  const {
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
  } = useCalendarDirectory({
    allEntries,
    employees,
    filterEmployee,
    filterProject,
    projects,
    teamRows,
  });

  /** Excel-Export des sichtbaren Zeitraums (inkl. Filter). */
  const exportXlsx = async () => {
    const rows = [...entries]
      .sort((a, b) =>
        (a.work_date + (a.start_time ?? "")).localeCompare(b.work_date + (b.start_time ?? "")),
      )
      .map((e) => ({
        Datum: formatDate(e.work_date),
        Mitarbeiter: e.employee_name,
        Status: statusLabel(e),
        Von: (e.start_time ?? "").slice(0, 5),
        Bis: (e.end_time ?? "").slice(0, 5),
        "Pause (Min.)": Number(e.break_minutes ?? 0),
        Stunden: Number(e.hours ?? 0),
        "Objekt / Einsatzort": e.location || projectName(e.project_id),
        Kunde: customerName(e.customer_id),
        Notiz: e.note || "",
      }));
    if (rows.length === 0) {
      toast.info("Für diesen Zeitraum gibt es keine Einträge zum Exportieren.");
      return;
    }
    try {
      const { buildXlsx } = await import("@/lib/xlsx");
      const blob = await buildXlsx([{ name: "Einsatzplan", rows }]);
      await saveFile(blob, `Einsatzplan_${periodLabel.replace(/[^\w]+/g, "_")}.xlsx`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Excel-Export konnte nicht erstellt werden.",
      );
    }
  };

  /** Druck-/PDF-Ausgabe des Kalenders (Querformat, ohne Bedienelemente). */
  const { createPlan, printPlan, refresh, removePlan } = useCalendarPlanning({
    employees,
    projects,
    queryClient,
    setDay,
    setForm,
  });

  /* ---------------------------------------------------------------
   * Drag & Drop: Einsätze verschieben bzw. Mitarbeiter auf einen Tag ziehen
   * Einsätze werden ausschließlich über ihre eindeutige id identifiziert.
   * ------------------------------------------------------------- */

  const {
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
  } = useCalendarDragDrop({ allEntries, employees, filterProject, projects, refresh, teamByEntry });

  /** Kopiert eine Aufgabe unverändert auf weitere Tage (Batch-INSERT). */
  const {
    TeamChips,
    assignmentsError,
    byDay,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    planByDay,
    repeatTask,
  } = useCalendarTeamActions({
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
  });

  /**
   * Erfasste Zeiten mit der Planung zusammenführen: pro Mitarbeiter, Tag und
   * (falls vorhanden) Objekt wird genau EIN Block angezeigt – die erfasste Zeit
   * ersetzt die geplante Schicht und gilt als erledigt.
   */
  const {
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
  } = useCalendarSummary({
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
  });

  return {
    TeamChips,
    actualByEmployee,
    byDay,
    confirmPlan,
    createPlan,
    customerName,
    customerSite,
    customers,
    day,
    dayEntries,
    days,
    detail,
    doneEntries,
    dropProps,
    dropTarget,
    employees,
    entryCardClasses,
    entryDragProps,
    entryLockClasses,
    exportXlsx,
    filterEmployee,
    filterProject,
    first,
    form,
    isAbsent,
    isCompleted,
    loadError,
    openDay,
    openPlans,
    periodLabel,
    planDetail,
    plannedFor,
    plannedHours,
    printPlan,
    projectName,
    projects,
    queryClient,
    removePlan,
    repeatEntry,
    repeatTask,
    setAnchor,
    setDay,
    setDetail,
    setDrag,
    setDropTarget,
    setEntryStatus,
    setFilterEmployee,
    setFilterProject,
    setForm,
    setPlanDetail,
    setRepeatEntry,
    setView,
    shift,
    teamNames,
    timesValid,
    today,
    view,
    visibleEmployees,
  };
}

export type EinsatzKalenderStateContext = NonNullable<ReturnType<typeof useEinsatzKalenderState>>;
