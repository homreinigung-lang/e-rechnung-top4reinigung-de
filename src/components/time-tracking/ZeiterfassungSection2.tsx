import { approvedWorkAmount } from "@/lib/approved-work-totals";
import { Button } from "@/components/ui/button";

import { Check, Pencil } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatMoney, formatDate } from "@/lib/format";
import { kwLabel } from "@/lib/kw";

import { ArbeitsnachweisFotos } from "@/components/ArbeitsnachweisFotos";
import { LeistungsnachweisDialog } from "@/components/LeistungsnachweisDialog";

import type { ZeiterfassungState } from "./useZeiterfassungState";
export function ZeiterfassungSection2({ state }: { state: ZeiterfassungState }) {
  const {
    approveWorkEntry,
    employeeRates,
    projects,
    removeEntry,
    setEntryOpen,
    setForm,
    toggleBilled,
    visibleEntries,
  } = state;
  return (
    <div className="surface overflow-hidden">
      {visibleEntries.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          Keine Einträge für diesen Filter im gewählten Monat.
        </p>
      ) : (
        <ul className="divide-y">
          {visibleEntries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {(e.employee_name as string) || "Ohne Zuordnung"} ·{" "}
                  {formatDate(e.work_date as string)} ·{" "}
                  <span className="text-muted-foreground">{kwLabel(e.work_date as string)}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {[
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
                {e.entry_type !== "absence" && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded border px-2 py-1">
                      {e.approval_status === "pending"
                        ? "Arbeitszeit: Zu prüfen"
                        : e.approval_status === "rejected"
                          ? "Arbeitszeit: Abgelehnt"
                          : "Arbeitszeit: Freigegeben"}
                    </span>
                    <span className="rounded border px-2 py-1">
                      {e.performance_status === "completed" || e.performance_completed_at
                        ? "Leistungsnachweis abgeschlossen"
                        : "Leistungsnachweis offen"}
                    </span>
                    <span className="rounded border px-2 py-1">
                      {Array.isArray(e.photo_paths) && e.photo_paths.length > 0
                        ? "Fotos vorhanden"
                        : "Keine Fotos"}
                    </span>
                  </div>
                )}
                <ArbeitsnachweisFotos
                  canDelete
                  entryId={e.id as string}
                  paths={((e as { photo_paths?: string[] }).photo_paths ?? []) as string[]}
                  invalidateKey="time_entries"
                />
                {(((e as { performance_services?: string[] }).performance_services ?? []).length >
                  0 ||
                  Boolean((e as { performance_note?: string }).performance_note) ||
                  Boolean((e as { employee_signature?: string }).employee_signature) ||
                  Boolean((e as { customer_signature?: string }).customer_signature)) && (
                  <div className="mt-2">
                    <LeistungsnachweisDialog
                      readOnly
                      entry={e}
                      project={projects.find((project) => project.id === e.project_id)}
                    />
                  </div>
                )}
              </div>
              <div className="text-right text-sm">
                {formatMoney(approvedWorkAmount(e, employeeRates.get(e.employee_id ?? "") ?? 0))}
              </div>
              {e.entry_type !== "absence" && e.approval_status === "pending" && (
                <Button
                  size="sm"
                  disabled={approveWorkEntry.isPending}
                  onClick={() => approveWorkEntry.mutate(e.id as string)}
                >
                  <Check className="size-4" /> Arbeitszeit freigeben
                </Button>
              )}
              <Button
                variant={e.billed ? "secondary" : "ghost"}
                size="sm"
                onClick={() => toggleBilled.mutate({ id: e.id as string, billed: !e.billed })}
              >
                <Check className="size-4" />
                {e.billed ? "Abgerechnet" : "Offen"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setForm({
                    id: e.id as string,
                    employee_id: (e.employee_id as string) ?? "",
                    employee_name: (e.employee_name as string) ?? "",
                    customer_id: (e.customer_id as string) ?? "",
                    project_id: (e.project_id as string) ?? "",
                    work_date: e.work_date as string,
                    start_time: e.start_time ? String(e.start_time).slice(0, 5) : "",
                    end_time: e.end_time ? String(e.end_time).slice(0, 5) : "",
                    break_minutes: String(e.break_minutes ?? 0),
                    hours: String(e.hours ?? ""),
                    hourly_rate: String(e.hourly_rate ?? ""),
                    location: (e.location as string) ?? "",
                    note: (e.note as string) ?? "",
                  });
                  setEntryOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <ConfirmDeleteButton
                iconClassName="size-4"
                title="Zeiteintrag wirklich löschen?"
                description="Der Zeiteintrag wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
                onConfirm={() => removeEntry.mutate(e.id as string)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
