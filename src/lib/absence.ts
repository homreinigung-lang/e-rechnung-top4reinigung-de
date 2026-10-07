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
  return !isAbsence(entry)
    ? approvalStatus(entry) !== "rejected"
    : approvalStatus(entry) === "approved";
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
  return "bg-sky-500/10 text-sky-600 border-sky-500/30";
}

/**
 * Zählt der Eintrag für die Lohnabrechnung (Stundenzettel)?
 * Nur bestätigte Einträge: Arbeitszeiten und Abwesenheiten müssen genehmigt
 * sein. Offene (pending) Planungs-/Schichteinträge fließen NICHT in die
 * Stunden- und Lohnsumme ein.
 */
export function countsForPayroll(entry: ApprovableLike) {
  return approvalStatus(entry) === "approved";
}

/** Keep different decisions separate when displaying the employee's requests. */
export function absenceRangesFor(
  entries: (ApprovableLike & { work_date: string; decision_note?: string | null })[],
) {
  const items = entries
    .filter(isAbsence)
    .map((entry) => ({
      date: entry.work_date,
      reason: absenceReason(entry),
      status: approvalStatus(entry),
      decisionNote: entry.decision_note ?? "",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ranges: {
    from: string;
    to: string;
    reason: AbsenceReason | null;
    status: ApprovalStatus;
    days: number;
    decisionNote: string;
  }[] = [];
  for (const item of items) {
    const last = ranges[ranges.length - 1];
    const nextDay = last
      ? new Date(new Date(`${last.to}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
      : null;
    if (
      last &&
      last.reason === item.reason &&
      last.status === item.status &&
      last.decisionNote === item.decisionNote &&
      (nextDay === item.date || last.to === item.date)
    ) {
      if (last.to !== item.date) {
        last.to = item.date;
        last.days += 1;
      }
    } else {
      ranges.push({
        from: item.date,
        to: item.date,
        reason: item.reason,
        status: item.status,
        days: 1,
        decisionNote: item.decisionNote,
      });
    }
  }
  return ranges.reverse();
}
