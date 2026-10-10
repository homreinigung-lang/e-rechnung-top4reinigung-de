import { LoadError, firstError } from "@/components/LoadError";

import { Input } from "@/components/ui/input";

import { formatDate } from "@/lib/format";

import { absenceClasses, absenceLabel, approvalClasses, approvalLabel } from "@/lib/absence";
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import { ZeitkontoCard } from "@/components/ZeitkontoCard";

import { ProjectDetailDialog } from "./ProjectDetailDialog";
import { ZeitErfassenDialog } from "./ZeitErfassenDialog";
import { MeineZeitenWeitereFunktionen } from "./MeineZeitenWeitereFunktionen";
import { MeineZeitenArbeitszeiten } from "./MeineZeitenArbeitszeiten";
import type { MeineZeitenState } from "./useMeineZeitenState";
export function MeineZeitenView({ state }: { state: MeineZeitenState }) {
  const {
    absenceRanges,
    absenceTotals,
    assignments,
    assignmentsError,
    confirmShift,
    entries,
    entriesError,
    materials,
    materialsError,
    me,
    month,
    projectMaterials,
    projectMaterialsError,
    projects,
    projectsError,
    releasedWeeksError,
    search,
    selectedProjectId,
    selectedTask,
    setMonth,
    setSelectedProjectId,
    totalHours,
  } = state;
  return (
    <div className="space-y-6">
      <LoadError
        error={firstError(
          entriesError,
          projectsError,
          releasedWeeksError,
          assignmentsError,
          projectMaterialsError,
          materialsError,
        )}
        title="Mitarbeiterdaten konnten nicht vollständig geladen werden"
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meine Arbeitszeiten</h1>
          <p className="mt-1 text-muted-foreground">
            {me.name}
            {me.role ? ` · ${me.role}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ZeitErfassenDialog
            employee={me}
            projects={projects}
            assignments={assignments as { project_id: string | null }[]}
          />
          <AbwesenheitZeitraum
            employees={[{ id: me.id, name: me.name, user_id: me.user_id }]}
            fixedEmployeeId={me.id}
            triggerLabel="Urlaub / Abwesenheit beantragen"
            variant="outline"
            asRequest
            initialOpen={search["aktion"] === "urlaub"}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Monat</div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2"
          />
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Stunden gesamt</div>
          <div className="mt-2 text-2xl font-bold">{totalHours.toFixed(2)} Std.</div>
        </div>
      </div>

      <MeineZeitenArbeitszeiten state={state} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Zeitkonto & Abwesenheit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Soll-/Ist-Stunden sowie Urlaub, Krankheit und sonstige Abwesenheiten im Überblick.
          </p>
        </div>
        <ZeitkontoCard
          employees={[
            {
              id: me.id,
              name: me.name,
              weekly_hours: me.weekly_hours ?? 0,
              contract_start: me.contract_start ?? null,
              vacation_days_per_year: me.vacation_days_per_year ?? 0,
              vacation_carryover_days: me.vacation_carryover_days ?? 0,
            },
          ]}
          entries={entries as never}
          month={month}
          readOnly
        />

        <section className="surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Meine Urlaubs- und Abwesenheitsanträge {month.slice(0, 4)}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded border px-2 py-1 ${absenceClasses("vacation")}`}>
                Genehmigter Urlaub: {absenceTotals.vacation} Tage
              </span>
              <span className={`rounded border px-2 py-1 ${absenceClasses("sick")}`}>
                Genehmigte Krankheit: {absenceTotals.sick} Tage
              </span>
              <span className={`rounded border px-2 py-1 ${absenceClasses("other")}`}>
                Genehmigte sonstige Abwesenheit: {absenceTotals.other} Tage
              </span>
            </div>
          </div>
          {absenceRanges.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Für {month.slice(0, 4)} sind keine Abwesenheiten geplant.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {absenceRanges.map((r) => (
                <li
                  key={`${r.from}-${r.reason}-${r.status}`}
                  className="flex flex-wrap items-center gap-3 py-2"
                >
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${absenceClasses(r.reason)}`}
                  >
                    {absenceLabel(r.reason)}
                  </span>
                  <span className="min-w-0 flex-1">
                    {formatDate(r.from)}
                    {r.to !== r.from ? ` – ${formatDate(r.to)}` : ""}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${approvalClasses(r.status)}`}
                  >
                    {approvalLabel(r.status)}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{r.days} Tag(e)</span>
                  {r.decisionNote && (
                    <p className="w-full text-muted-foreground">Verwaltung: {r.decisionNote}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-muted-foreground">
          Arbeitszeiten können Sie für Ihre Einsätze selbst erfassen. Korrekturen am Zeitkonto
          werden ausschließlich durch die Verwaltung vorgenommen. Urlaub und Abwesenheiten können
          Sie beantragen – sie gelten erst nach Genehmigung.
        </p>
      </section>

      <MeineZeitenWeitereFunktionen state={state} />

      <ProjectDetailDialog
        task={selectedTask}
        employee={me}
        onConfirm={(task) => confirmShift.mutate(task)}
        confirming={confirmShift.isPending}
        projectId={selectedProjectId}
        projects={projects}
        assignments={assignments}
        entries={entries}
        projectMaterials={projectMaterials}
        materials={materials}
        onClose={() => setSelectedProjectId(null)}
      />
    </div>
  );
}
