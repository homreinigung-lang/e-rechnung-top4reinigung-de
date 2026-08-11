/**
 * Abwesenheits-Logik für die Zeiterfassung.
 * Ein Zeiteintrag ist entweder Arbeitszeit ("work") oder eine Abwesenheit
 * ("absence") mit Grund: Urlaub, Krankheit oder Sonstiges.
 */
export type EntryType = "work" | "absence";
export type AbsenceReason = "vacation" | "sick" | "other";

export const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: "vacation", label: "Urlaub" },
  { value: "sick", label: "Krankheit" },
  { value: "other", label: "Sonstiges" },
];

type EntryLike = {
  entry_type?: string | null;
  absence_reason?: string | null;
};

export function isAbsence(entry: EntryLike) {
  return (entry.entry_type ?? "work") === "absence";
}

export function absenceReason(entry: EntryLike): AbsenceReason | null {
  if (!isAbsence(entry)) return null;
  const r = entry.absence_reason ?? "";
  return r === "vacation" || r === "sick" || r === "other" ? r : "other";
}

export function absenceLabel(reason: AbsenceReason | null) {
  return ABSENCE_REASONS.find((r) => r.value === reason)?.label ?? "Abwesenheit";
}

/** Kurzkennzeichnung für kompakte Tabellen (U / K / S). */
export function absenceShort(reason: AbsenceReason | null) {
  return reason === "vacation" ? "U" : reason === "sick" ? "K" : "S";
}

/** Farbliche Kennzeichnung – Krankheit bewusst in Rot (destructive). */
export function absenceClasses(reason: AbsenceReason | null) {
  if (reason === "sick") return "bg-destructive/10 text-destructive border-destructive/30";
  if (reason === "vacation") return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

/* ---------------------------------------------------------------------------
 * Freigabe-Workflow für Abwesenheiten
 * ------------------------------------------------------------------------- */

export type ApprovalStatus = "pending" | "approved" | "rejected";

type ApprovableLike = EntryLike & { approval_status?: string | null };

export function approvalStatus(entry: ApprovableLike): ApprovalStatus {
  const s = entry.approval_status ?? "approved";
  return s === "pending" || s === "rejected" ? s : "approved";
}

export function isPending(entry: ApprovableLike) {
  return approvalStatus(entry) === "pending";
}

export function isRejected(entry: ApprovableLike) {
  return approvalStatus(entry) === "rejected";
}

/**
 * Zählt der Eintrag für Kalender, Zeitkonto und Lohnabrechnung?
 * Abwesenheiten erst nach der Genehmigung durch die Verwaltung.
 */
export function isEffective(entry: ApprovableLike) {
  return !isAbsence(entry) ? approvalStatus(entry) !== "rejected" : approvalStatus(entry) === "approved";
}

export function approvalLabel(status: ApprovalStatus) {
  return status === "pending"
    ? "Wartet auf Genehmigung"
    : status === "rejected"
      ? "Abgelehnt"
      : "Genehmigt";
}

export function approvalClasses(status: ApprovalStatus) {
  if (status === "pending") return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  if (status === "rejected") return "bg-destructive/10 text-destructive border-destructive/30";
  return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
}
