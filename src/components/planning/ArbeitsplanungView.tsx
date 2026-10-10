import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Send,
  Save,
  UserPlus,
} from "lucide-react";

import { isoWeek, isoWeekYear } from "@/lib/kw";
import { DAY_LABELS, formatDayTime } from "@/lib/planung";
import { formatDate, formatNumber } from "@/lib/format";

import { LoadError } from "@/components/LoadError";
import { mondayOf, addDays } from "./shared";

import { WeekQuickFill } from "./WeekQuickFill";
import { ArbeitsplanungObjektSummen } from "./ArbeitsplanungObjektSummen";
import type { ArbeitsplanungState } from "./useArbeitsplanungState";
export function ArbeitsplanungView({ state }: { state: ArbeitsplanungState }) {
  const {
    absenceAssignments,
    applyCalculationPlan,
    applyReplacement,
    applyWeekTimes,
    assignEmployeeId,
    assignProjectId,
    cellDayHours,
    cellErrorList,
    cellHours,
    cellTimes,
    clearWeekTimes,
    copyPreviousWeek,
    dirtyKeys,
    employees,
    filter,
    initialPlan,
    loadError,
    monday,
    objects,
    openAssignment,
    overtimeWarnings,
    planningConflicts,
    queryClient,
    quickAssign,
    release,
    releaseLoading,
    releaseWeek,
    replacementCandidates,
    saveAll,
    seedBreakMinutes,
    seedEmployeeId,
    seedHoursPerVisit,
    seedProject,
    seedStartTime,
    seedVisitsPerWeek,
    setAssignEmployeeId,
    setAssignProjectId,
    setDayTime,
    setFilter,
    setMonday,
    setQuickAssign,
    setSeedBreakMinutes,
    setSeedEmployeeId,
    setSeedStartTime,
    visibleProjects,
    weekEnd,
    weekStart,
    withdrawRelease,
  } = state;
  return (
    <div className="space-y-6">
      <LoadError
        error={loadError}
        title="Planungsdaten konnten nicht geladen werden"
        onRetry={() => void queryClient.invalidateQueries()}
      />
      {cellErrorList.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Diese Einträge konnten nicht gespeichert werden:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {cellErrorList.map(([key, message]) => {
              const [eid, pid] = key.split("|");
              const emp = employees.find((e) => e.id === eid)?.name ?? "Mitarbeiter";
              const obj = objects.find((o) => o.id === pid)?.name ?? "Objekt";
              return (
                <li key={key}>
                  <span className="font-medium">
                    {emp} – {obj}:
                  </span>{" "}
                  {message}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold">Arbeitsplanung</h1>
        <p className="mt-1 text-muted-foreground">
          Auf eine Zelle klicken und Stunden je Wochentag (Mo–So) eintragen – die Wochensumme wird
          automatisch berechnet und nach der Freigabe im Mitarbeiterportal angezeigt.
        </p>
      </div>

      {initialPlan && (
        <section className="surface space-y-4 border-primary/30 p-5">
          <div>
            <h2 className="font-semibold">Planungsvorschlag aus Kalkulation</h2>
            <p className="text-sm text-muted-foreground">
              {seedProject?.name ?? "Verknüpftes Objekt"} · Soll{" "}
              {formatNumber(initialPlan.monthlyHours)} Std./Monat ·{" "}
              {formatNumber(initialPlan.visitsPerMonth)} Einsätze/Monat · ca.{" "}
              {formatNumber(seedHoursPerVisit)} Std. je Einsatz
            </p>
          </div>
          {seedVisitsPerWeek < 0.75 ? (
            <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Der Turnus liegt unter einem Einsatz pro Woche. Die konkreten Einsatzwochen bitte im
              Dienstplan manuell festlegen.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_140px_120px_auto] md:items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium">Mitarbeiter</label>
                <Select value={seedEmployeeId} onValueChange={setSeedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Mitarbeiter auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Startzeit</label>
                <Input
                  type="time"
                  value={seedStartTime}
                  onChange={(event) => setSeedStartTime(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Pause (Min.)</label>
                <Input
                  type="number"
                  min={0}
                  step={5}
                  value={seedBreakMinutes}
                  onChange={(event) => setSeedBreakMinutes(event.target.value)}
                />
              </div>
              <Button type="button" onClick={applyCalculationPlan}>
                In Wochenplan übernehmen
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Der Vorschlag verteilt den kalkulierten Turnus auf die ersten Wochentage. Vor dem
            Speichern können Tage und Uhrzeiten vollständig angepasst werden.
          </p>
        </section>
      )}

      <div className="surface flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Vorherige Woche"
            onClick={() => setMonday((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[220px] text-center">
            <div className="flex items-center justify-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" />
              KW {isoWeek(monday)} / {isoWeekYear(monday)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(weekStart)} – {formatDate(weekEnd)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Nächste Woche"
            onClick={() => setMonday((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMonday(mondayOf(new Date()))}>
            Aktuelle Woche
          </Button>
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setMonday(mondayOf(new Date(`${v}T12:00:00`)));
            }}
            className="h-9 w-[170px]"
          />
        </div>
        <Input
          placeholder="Objekt suchen (Name, Ort, Adresse) …"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {release ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          ) : (
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              KW {isoWeek(monday)}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  release ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {release ? "Freigegeben" : "Entwurf"}
              </span>
              {dirtyKeys.length > 0 && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  Ungespeicherte Änderungen
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {release
                ? `Freigegeben am ${formatDate(release.released_at.slice(0, 10))} – Mitarbeitende sehen diesen Plan in ihrem Konto.`
                : "Entwurf: nur intern sichtbar. Erst nach der Freigabe erscheint der Plan bei den Mitarbeitenden."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => copyPreviousWeek.mutate()}
            disabled={copyPreviousWeek.isPending}
          >
            <Copy className="mr-2 h-4 w-4" />
            Vorwoche kopieren
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending || dirtyKeys.length === 0}
          >
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
          {release && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => withdrawRelease.mutate()}
              disabled={withdrawRelease.isPending}
            >
              Freigabe zurücknehmen
            </Button>
          )}
          <Button
            type="button"
            onClick={async () => {
              if (planningConflicts.length > 0) {
                toast.error("Woche kann wegen Planungs-Konflikten nicht freigegeben werden.");
                return;
              }
              if (dirtyKeys.length > 0) await saveAll.mutateAsync();
              releaseWeek.mutate();
            }}
            disabled={
              releaseLoading ||
              releaseWeek.isPending ||
              saveAll.isPending ||
              planningConflicts.length > 0
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {release ? "Erneut freigeben" : "Woche freigeben"}
          </Button>
        </div>
      </div>

      {absenceAssignments.length > 0 && (
        <section className="surface space-y-3 p-5">
          <div>
            <h2 className="font-semibold">Vertretung / Springer</h2>
            <p className="text-sm text-muted-foreground">
              Für Einsätze während genehmigter Abwesenheit werden verfügbare Mitarbeitende
              vorgeschlagen. Springer werden bevorzugt.
            </p>
          </div>
          <div className="space-y-3">
            {absenceAssignments.map((item) => {
              const candidates = replacementCandidates(
                item.employee.id,
                item.dayIndex,
                item.time,
                item.hours,
              ).slice(0, 3);
              return (
                <div
                  key={item.employee.id + "-" + item.object.id + "-" + item.dayIndex}
                  className="rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {item.employee.name} · {item.object.name || "Objekt"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {DAY_LABELS[item.dayIndex]} · {item.absenceReason} ·{" "}
                        {formatDayTime(item.time) || item.hours.toFixed(2) + " Std."}
                      </div>
                    </div>
                    <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                      Vertretung nötig
                    </span>
                  </div>
                  {candidates.length === 0 ? (
                    <p className="mt-3 text-sm text-destructive">
                      Keine konfliktfreie Vertretung gefunden.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidates.map(({ candidate, remaining, springer, enoughCapacity }) => (
                        <Button
                          key={candidate.id}
                          type="button"
                          variant={springer ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            applyReplacement(
                              item.employee.id,
                              candidate.id,
                              item.object.id,
                              item.dayIndex,
                              item.time,
                            )
                          }
                        >
                          {candidate.name}
                          {springer ? " · Springer" : ""}
                          {Number.isFinite(remaining)
                            ? " · " + Math.max(0, remaining).toFixed(1) + " Std. frei"
                            : ""}
                          {!enoughCapacity ? " · Soll überschritten" : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Ein Vorschlag wird zunächst nur in den Entwurf übernommen. Danach „Speichern“ und erst
            anschließend die Woche freigeben.
          </p>
        </section>
      )}

      {(planningConflicts.length > 0 || overtimeWarnings.length > 0) && (
        <div className="space-y-2">
          {planningConflicts.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {planningConflicts.length} Planungs-Konflikt
                {planningConflicts.length === 1 ? "" : "e"}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {planningConflicts.slice(0, 8).map((conflict, index) => {
                  const employee =
                    employees.find((item) => item.id === conflict.employeeId)?.name ??
                    "Mitarbeiter";
                  return (
                    <li key={conflict.employeeId + "-" + conflict.dayIndex + "-" + index}>
                      <span className="font-medium">{employee}:</span> {conflict.message}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Freigabe ist gesperrt, bis Überschneidungen oder Einsätze während genehmigter
                Abwesenheiten korrigiert sind.
              </p>
            </div>
          )}

          {overtimeWarnings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                Sollstunden überschritten
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {overtimeWarnings.map(({ employee, planned, target, over }) => (
                  <li key={employee.id}>
                    <span className="font-medium">{employee.name}:</span> {planned.toFixed(1)} /{" "}
                    {target.toFixed(1)} Std. (+
                    {over.toFixed(1)} Std.)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <section className="surface space-y-3 p-4">
        <div className="flex items-start gap-3">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold">Mitarbeiter zuweisen</h2>
            <p className="text-sm text-muted-foreground">
              Am Computer können Sie einen Mitarbeiter auf ein Objekt ziehen. Auf Handy/Tablet
              Mitarbeiter und Objekt auswählen und „Einsatz planen“ öffnen.
            </p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)_auto]">
          <Select value={assignEmployeeId} onValueChange={setAssignEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Mitarbeiter auswählen" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignProjectId} onValueChange={setAssignProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Objekt auswählen" />
            </SelectTrigger>
            <SelectContent>
              {visibleProjects.map((object) => (
                <SelectItem key={object.id} value={object.id}>
                  {object.name || "Objekt"}
                  {object.city ? ` · ${object.city}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={() => {
              if (!assignEmployeeId || !assignProjectId) {
                toast.error("Bitte Mitarbeiter und Objekt auswählen.");
                return;
              }
              openAssignment(assignEmployeeId, assignProjectId);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Einsatz planen
          </Button>
        </div>
      </section>

      <ArbeitsplanungObjektSummen state={state} />

      <Dialog open={quickAssign !== null} onOpenChange={(open) => !open && setQuickAssign(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {quickAssign &&
            (() => {
              const employee = employees.find((item) => item.id === quickAssign.employeeId);
              const object = objects.find((item) => item.id === quickAssign.projectId);
              if (!employee || !object) return null;
              const times = cellTimes(employee.id, object.id);
              const days = cellDayHours(employee.id, object.id);
              const sum = cellHours(employee.id, object.id);
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>Einsatz planen · {employee.name}</DialogTitle>
                  </DialogHeader>
                  <div className="text-sm text-muted-foreground">
                    {object.name || "Objekt"}
                    {object.city ? ` · ${object.city}` : ""}
                  </div>
                  <WeekQuickFill
                    onApply={(template, dayCount) =>
                      applyWeekTimes(employee.id, object.id, template, dayCount)
                    }
                    onClear={() => clearWeekTimes(employee.id, object.id)}
                  />
                  <div className="grid grid-cols-[2rem_1fr_1fr_3.5rem_3rem] items-center gap-1 text-[10px] text-muted-foreground">
                    <span />
                    <span>Von</span>
                    <span>Bis</span>
                    <span>Pause</span>
                    <span className="text-right">Std.</span>
                  </div>
                  {DAY_LABELS.map((label, index) => (
                    <div
                      key={label}
                      className="grid grid-cols-[2rem_1fr_1fr_3.5rem_3rem] items-center gap-1"
                    >
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <Input
                        type="time"
                        value={times[index]?.start ?? ""}
                        onChange={(event) =>
                          setDayTime(employee.id, object.id, index, { start: event.target.value })
                        }
                        className="h-9 px-1 text-xs"
                      />
                      <Input
                        type="time"
                        value={times[index]?.end ?? ""}
                        onChange={(event) =>
                          setDayTime(employee.id, object.id, index, { end: event.target.value })
                        }
                        className="h-9 px-1 text-xs"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="5"
                        value={times[index]?.breakMin ? String(times[index]!.breakMin) : ""}
                        onChange={(event) =>
                          setDayTime(employee.id, object.id, index, {
                            breakMin: Number(event.target.value) || 0,
                          })
                        }
                        className="h-9 px-1 text-center text-xs"
                      />
                      <span className="text-right text-xs font-medium">
                        {(days[index] ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-semibold">Woche: {sum.toFixed(2)} Std.</span>
                    <Button type="button" onClick={() => setQuickAssign(null)}>
                      Übernehmen
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Der Einsatz wird zunächst als Entwurf übernommen. Danach oben „Speichern“ und
                    anschließend die Woche freigeben.
                  </p>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
