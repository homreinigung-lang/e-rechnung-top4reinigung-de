import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";
import { kwLabel } from "@/lib/kw";

import {
  absenceClasses,
  absenceLabel,
  absenceReason,
  approvalClasses,
  approvalLabel,
  approvalStatus,
  isAbsence,
} from "@/lib/absence";

import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";
import { LeistungsnachweisDialog } from "@/components/LeistungsnachweisDialog";
import { MeinEinsatzkalender } from "@/components/MeinEinsatzkalender";

import type { MeineZeitenState } from "./useMeineZeitenState";
export function MeineZeitenArbeitszeiten({ state }: { state: MeineZeitenState }) {
  const {
    assignments,
    confirmShift,
    confirmingKey,
    entries,
    monthEntries,
    projects,
    remove,
    setSelectedProjectId,
    setSelectedTask,
  } = state;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Arbeitszeiten</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Einsatzplan, erfasste Zeiten und Arbeitsnachweise für den gewählten Monat.
        </p>
      </div>
      <MeinEinsatzkalender
        assignments={assignments as never}
        projects={projects}
        entries={entries as never}
        onSelectProject={(id) => {
          setSelectedTask(null);
          setSelectedProjectId(id);
        }}
        onSelectTask={(task) => {
          setSelectedTask(task);
          setSelectedProjectId(task.projectId);
        }}
        onConfirm={(task) => confirmShift.mutate(task)}
        confirmingKey={confirmingKey}
      />

      <div className="surface overflow-hidden">
        {monthEntries.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Für diesen Monat sind noch keine Arbeitszeiten erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {monthEntries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    {formatDate(e.work_date as string)} ·{" "}
                    <span className="text-muted-foreground">{kwLabel(e.work_date as string)}</span>
                    {isAbsence(e) && (
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${absenceClasses(absenceReason(e))}`}
                      >
                        {absenceLabel(absenceReason(e))}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isAbsence(e)
                      ? "ganztägig · keine Arbeitsstunden"
                      : [
                          e.start_time && e.end_time
                            ? `${String(e.start_time).slice(0, 5)}–${String(e.end_time).slice(0, 5)}`
                            : null,
                          `Pause ${e.break_minutes} Min.`,
                          `${Number(e.hours).toFixed(2)} Std.`,
                          e.location || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </div>
                  {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                  {!isAbsence(e) && (
                    <>
                      <ArbeitsnachweisFotos
                        entryId={e.id as string}
                        paths={((e as { photo_paths?: string[] }).photo_paths ?? []) as string[]}
                        canUpload
                        invalidateKey="my_time_entries"
                      />
                      <div className="mt-3">
                        <LeistungsnachweisDialog
                          entry={e as never}
                          project={projects.find((p) => p.id === e.project_id)}
                        />
                      </div>
                    </>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${approvalClasses(approvalStatus(e))}`}
                >
                  {isAbsence(e)
                    ? approvalLabel(approvalStatus(e))
                    : approvalStatus(e) === "pending"
                      ? "Arbeitszeit: Zu prüfen"
                      : approvalStatus(e) === "rejected"
                        ? "Arbeitszeit: Abgelehnt"
                        : "Arbeitszeit: Freigegeben"}
                </span>
                {isAbsence(e) && approvalStatus(e) === "pending" && (
                  <ConfirmDeleteButton
                    iconClassName="size-4"
                    title="Antrag wirklich löschen?"
                    description="Der Abwesenheitsantrag wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
                    onConfirm={() => remove.mutate(e.id as string)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
