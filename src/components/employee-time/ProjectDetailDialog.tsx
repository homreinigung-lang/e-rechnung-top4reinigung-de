import { AssistantPanel } from "@/components/AssistantPanel";
import { Link } from "@tanstack/react-router";

import { EinsatzMeldungen } from "@/components/EinsatzMeldungen";

import { matchesTask, localDay } from "@/lib/employee-task";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Boxes, Navigation } from "lucide-react";

import { formatDate } from "@/lib/format";

import { mapsUrl, projectAddress } from "@/lib/maps";
import {
  DAY_NAMES,
  effectiveDayHours,
  normalizeDayHours,
  normalizeDayTimes,
  formatDayTime,
} from "@/lib/planung";
import { isAbsence } from "@/lib/absence";

import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";
import { LeistungsnachweisDialog } from "@/components/LeistungsnachweisDialog";
import { type DayTask } from "@/components/MeinEinsatzkalender";

import { ZeitErfassenDialog } from "./ZeitErfassenDialog";
export function ProjectDetailDialog({
  task,
  employee,
  onConfirm,
  confirming,
  projectId,
  projects,
  assignments,
  entries,
  projectMaterials,
  materials,
  onClose,
}: {
  task: DayTask | null;
  employee: { id: string; user_id: string; name: string };
  onConfirm: (task: DayTask) => void;
  confirming: boolean;
  projectId: string | null;
  projects: {
    id: string;
    name: string;
    city: string;
    address_line: string;
    postal_code: string;
    customer_name?: string;
  }[];
  assignments: {
    id: string;
    project_id: string | null;
    assignment_role: string;
    hours_per_week: number;
    day_hours?: unknown;
    day_times?: unknown;
    start_date: string | null;
    end_date: string | null;
  }[];
  entries: Array<{
    id: string;
    project_id?: string | null;
    work_date?: string | null;
    hours?: number | string | null;
    location?: string | null;
    employee_name?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    break_minutes?: number | null;
    photo_paths?: string[] | null;
    performance_services?: string[] | null;
    performance_note?: string | null;
    employee_signature?: string | null;
    customer_signature?: string | null;
    customer_signer_name?: string | null;
    performance_status?: string | null;
    performance_completed_at?: string | null;
    entry_type?: string | null;
    absence_reason?: string | null;
  }>;
  projectMaterials: {
    id: string;
    project_id: string;
    material_id: string;
    target_stock: number;
    object_stock: number;
  }[];
  materials: { id: string; name: string; unit: string }[];
  onClose: () => void;
}) {
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  const address = project ? projectAddress(project) : "";
  const projectAssignments = assignments.filter((a) => a.project_id === projectId);
  const assignedMaterials = projectMaterials.filter((row) => row.project_id === projectId);
  const projectEntries = entries
    .filter(
      (entry) =>
        entry.project_id === projectId && !isAbsence(entry) && (!task || matchesTask(entry, task)),
    )
    .sort((a, b) => String(b.work_date ?? "").localeCompare(String(a.work_date ?? "")))
    .slice(0, 5);
  const activeEntry = task ? (projectEntries[0] ?? null) : null;
  const workTimeDone = Boolean(activeEntry);
  const performanceDone = Boolean(
    activeEntry?.performance_status === "completed" || activeEntry?.performance_completed_at,
  );
  const photosDone = Boolean(activeEntry?.photo_paths?.length);

  // Tageswerte aus der Arbeitsplanung; ältere Einträge ohne Tageswerte auf Mo–Fr verteilen.
  const dayTotals = projectAssignments.reduce<number[]>((acc, a) => {
    const effective = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
    return acc.map((v, i) => v + (effective[i] ?? 0));
  }, normalizeDayHours(null));
  const totalHours = dayTotals.reduce((sum, value) => sum + value, 0);
  // Arbeitszeiten (Von–Bis) je Wochentag aus der Planung.
  const dayRanges = Array.from({ length: 7 }, (_, i) =>
    projectAssignments
      .map((a) => formatDayTime(normalizeDayTimes(a.day_times)[i]))
      .filter(Boolean)
      .join(", "),
  );

  return (
    <Dialog open={!!projectId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project?.name ?? "Objekt"}</DialogTitle>
          <DialogDescription>
            Einsatzdetails, Material, Arbeitsnachweise und Routenführung
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {task ? (
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div>
                <p className="font-semibold">Einsatz am {formatDate(task.date)}</p>
                <p className="text-sm">
                  {task.range || "Keine Uhrzeit hinterlegt"} · {task.hours.toFixed(2)} Std. geplant
                </p>
              </div>

              <div className="rounded-lg border bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Einsatz-Status
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span
                    className={
                      workTimeDone ? "font-medium text-foreground" : "text-muted-foreground"
                    }
                  >
                    {workTimeDone ? "✓" : "○"} Arbeitszeit
                  </span>
                  <span
                    className={
                      performanceDone ? "font-medium text-foreground" : "text-muted-foreground"
                    }
                  >
                    {performanceDone ? "✓" : "○"} Leistungsnachweis
                  </span>
                  <span
                    className={photosDone ? "font-medium text-foreground" : "text-muted-foreground"}
                  >
                    {photosDone ? "✓" : "○"} Fotos
                  </span>
                </div>
              </div>

              {activeEntry ? (
                <div className="rounded-lg border bg-background px-3 py-2 text-sm">
                  <span className="font-medium">✓ Arbeitszeit erfasst</span>
                  {activeEntry.start_time && activeEntry.end_time ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {activeEntry.start_time.slice(0, 5)}–{activeEntry.end_time.slice(0, 5)}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    {" "}
                    · {Number(activeEntry.hours ?? 0).toFixed(2)} Std.
                  </span>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {projectEntries.length === 0 && task.date <= localDay() ? (
                  <Button
                    disabled={confirming || !task.start || !task.end}
                    onClick={() => onConfirm(task)}
                  >
                    Planzeit als Arbeitszeit übernehmen
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {projectEntries.length ? "Arbeitszeit erfasst" : "Einsatz geplant"}
                  </span>
                )}
                <Button asChild variant="outline">
                  <Link
                    to="/nachrichten"
                    search={{
                      mitarbeiter: employee.id,
                      einsatz: task.assignmentId,
                      datum: task.date,
                    }}
                  >
                    Einsatz im Chat besprechen
                  </Link>
                </Button>
                <ZeitErfassenDialog
                  employee={employee}
                  projects={projects}
                  assignments={assignments}
                  task={task}
                />
              </div>
              {!workTimeDone ? (
                <p className="text-xs text-muted-foreground">
                  Stimmt die Planzeit nicht, erfassen Sie stattdessen die tatsächliche Arbeitszeit.
                </p>
              ) : null}
            </div>
          ) : null}
          {task && task.projectId ? (
            <EinsatzMeldungen
              employee={employee}
              task={{
                assignmentId: task.assignmentId,
                projectId: task.projectId,
                date: task.date,
                name: project?.name ?? task.name,
              }}
            />
          ) : null}
          {task ? (
            <details key={`${task.assignmentId}-${task.date}`} className="rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">KI-Frage zu diesem Einsatz</summary>
              <div className="mt-3">
                <AssistantPanel
                  mode="work"
                  assignmentId={task.assignmentId}
                  date={task.date}
                  employeeId={employee.id}
                />
              </div>
            </details>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Kunde</div>
              <div className="mt-1 text-sm font-medium">{project?.customer_name || "—"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Adresse</div>
              <div className="mt-1 text-sm font-medium">
                {address || "Keine Adresse hinterlegt"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Wochenstunden</div>
              <div className="mt-1 text-sm font-medium">{totalHours.toFixed(2)} Std.</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Planungen</div>
              <div className="mt-1 text-sm font-medium">{projectAssignments.length}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Arbeitszeiten je Wochentag
            </div>
            <ul className="mt-1 divide-y text-sm">
              {DAY_NAMES.map((name, i) => (
                <li key={name} className="flex items-center justify-between py-1.5">
                  <span className={dayTotals[i] ? "font-medium" : "text-muted-foreground"}>
                    {name}
                  </span>
                  <span className={dayTotals[i] ? "font-medium" : "text-muted-foreground"}>
                    {dayRanges[i] ? `${dayRanges[i]} · ` : ""}
                    {(dayTotals[i] ?? 0).toFixed(2)} Std.
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between py-1.5 font-semibold">
                <span>Summe</span>
                <span>{totalHours.toFixed(2)} Std.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Boxes className="size-4 text-muted-foreground" />
              <div className="font-medium">Material am Objekt</div>
            </div>
            {assignedMaterials.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Für dieses Objekt ist kein Material hinterlegt.
              </p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {assignedMaterials.map((row) => {
                  const material = materials.find((item) => item.id === row.material_id);
                  const low =
                    Number(row.target_stock ?? 0) > 0 &&
                    Number(row.object_stock ?? 0) < Number(row.target_stock ?? 0);
                  return (
                    <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium">{material?.name ?? "Material"}</span>
                        {low && (
                          <span className="ml-2 text-xs font-medium text-amber-700">
                            Nachfüllen
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {Number(row.object_stock ?? 0).toFixed(2)} {material?.unit ?? ""}
                        {Number(row.target_stock ?? 0) > 0
                          ? ` / Soll ${Number(row.target_stock).toFixed(2)}`
                          : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-md border p-3">
            <div className="font-medium">
              {task
                ? "Arbeitsnachweise / Fotos dieses Einsatzes"
                : "Letzte Arbeitsnachweise / Fotos"}
            </div>
            {projectEntries.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Für dieses Objekt gibt es noch keinen eigenen Arbeitszeiteintrag.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {projectEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {entry.work_date ? formatDate(entry.work_date) : "—"}
                      </span>
                      <span className="text-muted-foreground">
                        {Number(entry.hours ?? 0).toFixed(2)} Std.
                      </span>
                    </div>
                    {entry.performance_services && entry.performance_services.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entry.performance_services.map((service) => (
                          <span key={service} className="rounded border px-2 py-0.5 text-xs">
                            {service}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <LeistungsnachweisDialog entry={entry as never} project={project as never} />
                    </div>
                    <ArbeitsnachweisFotos
                      entryId={entry.id}
                      paths={entry.photo_paths ?? []}
                      canUpload
                      invalidateKey="my_time_entries"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {address && (
            <Button asChild className="w-full">
              <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
                <Navigation className="mr-2 h-4 w-4" />
                Zum Einsatzort navigieren
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
