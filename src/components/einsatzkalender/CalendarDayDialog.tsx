import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { HeartPulse, Plus } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate } from "@/lib/format";
import {
  ABSENCE_REASONS,
  absenceClasses,
  absenceLabel,
  absenceReason,
  type AbsenceReason,
  type EntryType,
} from "@/lib/absence";
import { GermanTimeInput } from "@/components/GermanDateTimeInput";
import { mapsUrl } from "@/lib/maps";
import { NO_PROJECT, SERVICE_CATEGORIES, ServiceCategory } from "./shared";
import type { EinsatzKalenderStateContext } from "./useEinsatzKalenderState";

export function CalendarDayDialog({ state }: { state: EinsatzKalenderStateContext }) {
  const {
    createPlan,
    customerSite,
    customers,
    day,
    dayEntries,
    employees,
    form,
    isAbsent,
    plannedHours,
    projects,
    removePlan,
    setDay,
    setForm,
    timesValid,
  } = state;
  return (
    <Dialog open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isAbsent ? "Abwesenheit eintragen" : "Einsatz planen"} – {day ? formatDate(day) : ""}
          </DialogTitle>
        </DialogHeader>

        {dayEntries.length > 0 && (
          <ul className="divide-y rounded-md border">
            {dayEntries.map((e) => {
              const reason = absenceReason(e);
              return (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {reason
                      ? "ganztägig"
                      : `${(e.start_time ?? "").slice(0, 5)}–${(e.end_time ?? "").slice(0, 5)}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{e.employee_name}</span>
                    {e.location ? ` · ${e.location}` : ""}
                    {customerSite(e.customer_id).address ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        Einsatzort: {customerSite(e.customer_id).address}
                      </span>
                    ) : null}
                  </span>

                  {reason ? (
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${absenceClasses(reason)}`}
                    >
                      {reason === "sick" && <HeartPulse className="size-3" />}
                      {absenceLabel(reason)}
                    </span>
                  ) : (
                    <span className="shrink-0">{Number(e.hours ?? 0).toFixed(2)} Std.</span>
                  )}
                  <ConfirmDeleteButton
                    title="Eintrag wirklich löschen?"
                    description={`Der Eintrag für „${e.employee_name || "Mitarbeiter"}"${e.location ? ` (${e.location})` : ""} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                    onConfirm={() => removePlan.mutate(e.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Mitarbeiter (Mehrfachauswahl)</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setForm({ ...form, employeeIds: employees.map((e) => e.id) })}
                >
                  Alle
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setForm({ ...form, employeeIds: [] })}
                >
                  Keine
                </button>
              </div>
            </div>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
              {employees.length === 0 && (
                <span className="text-sm text-muted-foreground">Keine Mitarbeiter vorhanden</span>
              )}
              {employees.map((e) => {
                const active = form.employeeIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        employeeIds: active
                          ? form.employeeIds.filter((id) => id !== e.id)
                          : [...form.employeeIds, e.id],
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.employeeIds.length} ausgewählt – der Einsatz wird für alle gleichzeitig
              angelegt.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Art des Eintrags</Label>
            <Select
              value={form.entryType}
              onValueChange={(v) => setForm({ ...form, entryType: v as EntryType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">Arbeitseinsatz</SelectItem>
                <SelectItem value="absence">Abwesenheit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isAbsent && (
            <div className="space-y-2">
              <Label>Leistungsart</Label>
              <Select
                value={form.serviceCategory}
                onValueChange={(v) => setForm({ ...form, serviceCategory: v as ServiceCategory })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isAbsent && (
            <div className="space-y-2">
              <Label>Grund der Abwesenheit</Label>
              <Select
                value={form.absenceReason}
                onValueChange={(v) => setForm({ ...form, absenceReason: v as AbsenceReason })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isAbsent && (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="k-loc">Objekt / Projekt (Freitext)</Label>
                <Input
                  id="k-loc"
                  list="k-projects"
                  value={form.location}
                  placeholder="Projekt, Kunde oder Adresse frei eingeben"
                  onChange={(e) => {
                    const v = e.target.value;
                    const match = projects.find(
                      (p) => (p.name || "").trim().toLowerCase() === v.trim().toLowerCase(),
                    );
                    setForm({ ...form, location: v, projectId: match?.id ?? NO_PROJECT });
                  }}
                />
                <datalist id="k-projects">
                  {projects.map((p) => (
                    <option key={p.id} value={p.name || ""}>
                      {p.city || ""}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Kunde (Einsatzort)</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => {
                    // Einsatzort des Kunden als Ortsangabe vorbelegen, wenn noch leer.
                    const site = customerSite(v === NO_PROJECT ? null : v).address;
                    setForm((f) => ({
                      ...f,
                      customerId: v,
                      location: f.location.trim() ? f.location : site,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kunde wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>Ohne Kunde</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerSite(form.customerId === NO_PROJECT ? null : form.customerId).address && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                    <span className="font-medium">
                      {customerSite(form.customerId).own
                        ? "Einsatzort: "
                        : "Adresse (Rechnungsadresse): "}
                    </span>
                    <a
                      href={mapsUrl(customerSite(form.customerId).address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {customerSite(form.customerId).address}
                    </a>
                    {customerSite(form.customerId).note && (
                      <span className="block text-muted-foreground">
                        {customerSite(form.customerId).note}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="k-start">Von (HH:MM)</Label>
                <GermanTimeInput
                  id="k-start"
                  value={form.start}
                  onChange={(v) => setForm({ ...form, start: v })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="k-end">Bis (HH:MM)</Label>
                <GermanTimeInput
                  id="k-end"
                  value={form.end}
                  onChange={(v) => setForm({ ...form, end: v })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="k-break">Pause (Min.)</Label>
                <Input
                  id="k-break"
                  inputMode="numeric"
                  value={form.breakMinutes}
                  onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="k-note">Notiz</Label>
            <Input
              id="k-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {isAbsent ? (
            <>
              Ganztägige Abwesenheit:{" "}
              <span className="font-medium text-foreground">
                {absenceLabel(form.absenceReason)}
              </span>{" "}
              – wird ohne Arbeitsstunden erfasst und in der Monatsabrechnung separat ausgewiesen.
            </>
          ) : (
            <>
              Geplante Dauer:{" "}
              <span className="font-medium text-foreground">
                {timesValid ? `${plannedHours.toFixed(2)} Std.` : "—"}
              </span>
              {timesValid && plannedHours <= 0 ? (
                <span className="text-destructive"> · Endzeit/Pause prüfen</span>
              ) : null}
            </>
          )}
        </p>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {form.employeeIds.length === 0 && (
            <span className="text-xs text-destructive">
              Bitte zuerst mindestens einen Mitarbeiter auswählen.
            </span>
          )}
          <Button
            onClick={() => {
              if (!day) return;
              if (form.employeeIds.length === 0) {
                toast.error("Bitte mindestens einen Mitarbeiter auswählen.");
                return;
              }
              if (!isAbsent && (!timesValid || plannedHours <= 0)) {
                toast.error("Bitte gültige Start-/Endzeit eintragen (Dauer über 0 Stunden).");
                return;
              }
              createPlan.mutate({ ...form, workDate: day });
            }}
            disabled={createPlan.isPending}
          >
            <Plus className="size-4" />{" "}
            {createPlan.isPending
              ? "Wird gespeichert…"
              : isAbsent
                ? "Abwesenheit eintragen"
                : "Einsatz eintragen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
