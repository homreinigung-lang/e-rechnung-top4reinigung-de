/**
 * Farbliche Statuslogik für den Einsatz-Kalender.
 * Reine Darstellungslogik – es werden keine Daten verändert.
 */
import { absenceReason, isAbsence, isPending, isRejected } from "@/lib/absence";

export type EinsatzStatus = "done" | "running" | "planned" | "cancelled" | "vacation" | "sick" | "absence" | "requested";

type EntryLike = {
  work_date: string;
  entry_type?: string | null;
  absence_reason?: string | null;
  approval_status?: string | null;
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function einsatzStatus(entry: EntryLike): EinsatzStatus {
  if (isRejected(entry)) return "cancelled";
  if (isAbsence(entry)) {
    if (isPending(entry)) return "requested";
    const reason = absenceReason(entry);
    return reason === "vacation" ? "vacation" : reason === "sick" ? "sick" : "absence";
  }
  if (isPending(entry)) return "requested";
  const today = todayIso();
  if (entry.work_date < today) return "done";
  if (entry.work_date === today) return "running";
  return "planned";
}

export const STATUS_LABELS: Record<EinsatzStatus, string> = {
  done: "Abgeschlossen",
  running: "In Bearbeitung",
  planned: "Geplant",
  cancelled: "Storniert / abgelehnt",
  vacation: "Urlaub",
  sick: "Krankheit",
  absence: "Abwesenheit",
  requested: "Beantragt",
};

/** Rahmen + Hintergrund + Textfarbe je Status (Chips im Kalender). */
export const STATUS_CLASSES: Record<EinsatzStatus, string> = {
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  running: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-400",
  planned: "border-primary/30 bg-primary/10 text-primary",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive line-through",
  vacation: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sick: "border-destructive/40 bg-destructive/10 text-destructive",
  absence: "border-border bg-muted text-muted-foreground",
  requested: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

/** Kleiner Farbpunkt für die Legende. */
export const STATUS_DOTS: Record<EinsatzStatus, string> = {
  done: "bg-emerald-500",
  running: "bg-sky-500",
  planned: "bg-primary",
  cancelled: "bg-destructive",
  vacation: "bg-amber-500",
  sick: "bg-destructive",
  absence: "bg-muted-foreground",
  requested: "bg-violet-500",
};

export const LEGEND: EinsatzStatus[] = [
  "planned",
  "running",
  "done",
  "cancelled",
  "vacation",
  "sick",
  "requested",
];

export function statusLabel(entry: EntryLike) {
  return STATUS_LABELS[einsatzStatus(entry)];
}

export function statusClasses(entry: EntryLike) {
  return STATUS_CLASSES[einsatzStatus(entry)];
}
