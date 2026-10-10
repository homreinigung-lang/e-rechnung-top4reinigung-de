import { LoadError } from "@/components/LoadError";
import { LEGEND, STATUS_DOTS, STATUS_LABELS } from "@/lib/einsatz-status";
import {
  KalenderEmployee,
  KalenderProject,
  SERVICE_CATEGORIES,
} from "@/components/einsatzkalender/shared";
import { useEinsatzKalenderState } from "@/components/einsatzkalender/useEinsatzKalenderState";
import { CalendarPlanDialog } from "@/components/einsatzkalender/CalendarPlanDialog";
import { CalendarEntryDialog } from "@/components/einsatzkalender/CalendarEntryDialog";
import { CalendarDayDialog } from "@/components/einsatzkalender/CalendarDayDialog";
import { CalendarWeekGrid } from "@/components/einsatzkalender/CalendarWeekGrid";
import { CalendarMonthGrid } from "@/components/einsatzkalender/CalendarMonthGrid";
import { CalendarFilters } from "@/components/einsatzkalender/CalendarFilters";
import { CalendarToolbar } from "@/components/einsatzkalender/CalendarToolbar";
import { RepeatDialog } from "@/components/einsatzkalender/RepeatDialog";

export function EinsatzKalender({
  employees,
  projects: projectsProp = [],
}: {
  employees: KalenderEmployee[];
  projects?: KalenderProject[];
}) {
  const state = useEinsatzKalenderState({ employees, projects: projectsProp });

  const {
    actualByEmployee,
    loadError,
    plannedFor,
    queryClient,
    repeatEntry,
    repeatTask,
    setDrag,
    setDropTarget,
    setRepeatEntry,
    view,
    visibleEmployees,
  } = state;
  return (
    <section id="einsatz-kalender-print" className="surface space-y-4 p-5">
      <LoadError
        error={loadError}
        title="Kalenderdaten konnten nicht geladen werden"
        onRetry={() => void queryClient.invalidateQueries()}
      />
      <CalendarToolbar state={state} />

      <CalendarFilters state={state} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${STATUS_DOTS[s]}`} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {SERVICE_CATEGORIES.map((c) => (
          <span key={c.value} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        ))}
      </div>

      {employees.length > 0 && (
        <div className="kalender-no-print rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium">
            Mitarbeiter per Drag &amp; Drop auf einen Tag ziehen
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Standardzeit 08:00–16:00 (Pause 30 Min.) – bestehende Einsätze lassen sich direkt auf
            einen anderen Tag ziehen.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {employees.map((emp) => (
              <span
                key={emp.id}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = "copy";
                  ev.dataTransfer.setData("text/plain", emp.id);
                  setDrag({ kind: "employee", employeeId: emp.id });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDropTarget(null);
                }}
                className="cursor-grab select-none rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-sm active:cursor-grabbing"
              >
                {emp.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {view === "month" && visibleEmployees.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {visibleEmployees.map((emp) => {
            const actual = actualByEmployee.get(emp.id) ?? 0;
            const planned = plannedFor(emp);
            return (
              <span key={emp.id} className="rounded border px-2 py-1">
                <span className="font-medium">{emp.name}</span> · Soll {planned.toFixed(2)} / Ist{" "}
                {actual.toFixed(2)} Std.
              </span>
            );
          })}
        </div>
      )}

      {view === "month" ? <CalendarMonthGrid state={state} /> : <CalendarWeekGrid state={state} />}

      <CalendarDayDialog state={state} />

      {/* Schnellansicht: Details eines einzelnen Einsatzes */}
      <CalendarEntryDialog state={state} />
      {/* Plan-Details: geplante Schicht bestätigen */}
      <CalendarPlanDialog state={state} />

      <RepeatDialog
        entry={repeatEntry}
        pending={repeatTask.isPending}
        onClose={() => setRepeatEntry(null)}
        onConfirm={(dates) => repeatEntry && repeatTask.mutate({ source: repeatEntry, dates })}
      />
    </section>
  );
}

export type { KalenderEmployee, KalenderProject } from "@/components/einsatzkalender/shared";
