import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GermanDateInput, GermanTimeInput } from "@/components/GermanDateTimeInput";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Download, FileText, Pencil, Plus, Users } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatMoney } from "@/lib/format";

import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";
import { Urlaubsantraege } from "@/components/Urlaubsantraege";
import { ZeitkontoCard } from "@/components/ZeitkontoCard";

import { emptyEntry, CONTRACT_TYPES, emptyEmployee } from "./shared";

import type { ZeiterfassungState } from "./useZeiterfassungState";
export function ZeiterfassungMitarbeiterZeiterfassung({ state }: { state: ZeiterfassungState }) {
  const {
    customers,
    emp,
    empOpen,
    employees,
    entries,
    entryOpen,
    exportCsv,
    exportPdf,
    form,
    month,
    previewHours,
    projects,
    removeEmployee,
    saveEmployee,
    saveEntry,
    setEmp,
    setEmpOpen,
    setEntryOpen,
    setForm,
  } = state;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">Mitarbeiter-Zeiterfassung</h1>
        <p className="mt-1 text-muted-foreground">
          Arbeitszeiten, Pausen und Stunden je Mitarbeiter, Kunde und Einsatzort verwalten.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportCsv}>
          <Download className="size-4" /> Stundenzettel-CSV
        </Button>
        <Button variant="outline" onClick={exportPdf}>
          <FileText className="size-4" /> Stundenzettel-PDF
        </Button>

        <AbwesenheitZeitraum employees={employees.map((e) => ({ id: e.id, name: e.name }))} />

        <Dialog
          open={empOpen}
          onOpenChange={(o) => {
            setEmpOpen(o);
            if (!o) setEmp(emptyEmployee);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">
              <Users className="size-4" /> Mitarbeiter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Mitarbeiter verwalten</DialogTitle>
            </DialogHeader>
            <Urlaubsantraege />

            <ZeitkontoCard
              employees={employees.map((e) => ({
                id: e.id,
                name: e.name,
                weekly_hours: (e as unknown as { weekly_hours?: number }).weekly_hours ?? 0,
                contract_start:
                  (e as unknown as { contract_start?: string | null }).contract_start ?? null,
                vacation_days_per_year:
                  (e as unknown as { vacation_days_per_year?: number }).vacation_days_per_year ?? 0,
                vacation_carryover_days:
                  (e as unknown as { vacation_carryover_days?: number }).vacation_carryover_days ??
                  0,
              }))}
              entries={entries as never}
              month={month}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-name">Name</Label>
                <Input
                  id="emp-name"
                  value={emp.name}
                  onChange={(e) => setEmp({ ...emp, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-role">Funktion</Label>
                <Input
                  id="emp-role"
                  value={emp.role}
                  onChange={(e) => setEmp({ ...emp, role: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-rate">Stundensatz (EUR)</Label>
                <Input
                  id="emp-rate"
                  inputMode="decimal"
                  value={emp.hourly_rate}
                  onChange={(e) => setEmp({ ...emp, hourly_rate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-persno">Personalnummer</Label>
                <Input
                  id="emp-persno"
                  dir="ltr"
                  value={emp.personnel_number}
                  onChange={(e) => setEmp({ ...emp, personnel_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-phone">Telefonnummer</Label>
                <Input
                  id="emp-phone"
                  type="tel"
                  dir="ltr"
                  value={emp.phone}
                  onChange={(e) => setEmp({ ...emp, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-email">E-Mail (Login für Mitarbeiter)</Label>
                <Input
                  id="emp-email"
                  type="email"
                  dir="ltr"
                  value={emp.email}
                  onChange={(e) => setEmp({ ...emp, email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Mit dieser E-Mail und Ihrem Unternehmens-Code kann sich der Mitarbeiter im
                  Mitarbeiterzugang registrieren und danach unter „Meine Zeiten“ nur die eigenen
                  Arbeitszeiten erfassen.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <div className="border-t pt-3 text-sm font-medium">Vertragsdaten</div>
              </div>
              <div className="space-y-2">
                <Label>Vertragsart</Label>
                <Select
                  value={emp.contract_type}
                  onValueChange={(v) => setEmp({ ...emp, contract_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Vertragsart wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-start">Vertragsbeginn</Label>
                <GermanDateInput
                  id="emp-start"
                  value={emp.contract_start}
                  onChange={(iso) => setEmp({ ...emp, contract_start: iso })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-weekly">Wöchentliche Soll-Arbeitsstunden</Label>
                <Input
                  id="emp-weekly"
                  inputMode="decimal"
                  value={emp.weekly_hours}
                  onChange={(e) => setEmp({ ...emp, weekly_hours: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => saveEmployee.mutate(emp)}
                disabled={!emp.name.trim() || saveEmployee.isPending}
              >
                Speichern
              </Button>
            </DialogFooter>

            <ul className="divide-y border-t">
              {employees.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        e.personnel_number ? `Nr. ${e.personnel_number}` : null,
                        e.role,
                        `${formatMoney(Number(e.hourly_rate))}/Std.`,
                        e.phone || null,
                        e.email || null,
                        e.auth_user_id ? "Login aktiv" : "Kein Login",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setEmp({
                        id: e.id,
                        name: e.name,
                        role: e.role,
                        email: e.email ?? "",
                        phone: e.phone ?? "",
                        personnel_number: e.personnel_number ?? "",
                        hourly_rate: String(e.hourly_rate ?? ""),
                        contract_type: e.contract_type ?? "",
                        contract_start: e.contract_start ?? "",
                        weekly_hours: e.weekly_hours ? String(e.weekly_hours) : "",
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDeleteButton
                    iconClassName="size-4"
                    title="Mitarbeiter wirklich löschen?"
                    description={`Der Mitarbeiter „${e.name || "ohne Namen"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                    onConfirm={() => removeEmployee.mutate(e.id)}
                  />
                </li>
              ))}
              {employees.length === 0 && (
                <li className="py-3 text-sm text-muted-foreground">
                  Noch keine Mitarbeiter angelegt.
                </li>
              )}
            </ul>
          </DialogContent>
        </Dialog>

        <Dialog
          open={entryOpen}
          onOpenChange={(o) => {
            setEntryOpen(o);
            if (!o) setForm(emptyEntry());
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" /> Zeit erfassen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Zeiteintrag bearbeiten" : "Neuer Zeiteintrag"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mitarbeiter</Label>
                <Select
                  value={form.employee_id}
                  onValueChange={(v) => {
                    const e = employees.find((x) => x.id === v);
                    setForm({
                      ...form,
                      employee_id: v,
                      employee_name: e?.name ?? "",
                      hourly_rate: form.hourly_rate || String(e?.hourly_rate ?? ""),
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mitarbeiter wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kunde / Objekt</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Projekt / Baustelle</Label>
                <Select
                  value={form.project_id}
                  onValueChange={(v) => setForm({ ...form, project_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || "Ohne Namen"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work_date">Datum</Label>
                <GermanDateInput
                  id="work_date"
                  value={form.work_date}
                  onChange={(iso) => setForm({ ...form, work_date: iso })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Einsatzort</Label>
                <Input
                  id="location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Von</Label>
                <GermanTimeInput
                  id="start_time"
                  value={form.start_time}
                  onChange={(t) => setForm({ ...form, start_time: t })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Bis</Label>
                <GermanTimeInput
                  id="end_time"
                  value={form.end_time}
                  onChange={(t) => setForm({ ...form, end_time: t })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="break_minutes">Pause (Minuten)</Label>
                <Input
                  id="break_minutes"
                  inputMode="numeric"
                  value={form.break_minutes}
                  onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hours">Stunden (optional, überschreibt Berechnung)</Label>
                <Input
                  id="hours"
                  inputMode="decimal"
                  placeholder={String(previewHours)}
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Stundensatz (EUR)</Label>
                <Input
                  id="hourly_rate"
                  inputMode="decimal"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="note">Notiz</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Berechnete Arbeitszeit: <strong>{previewHours} Std.</strong>
            </p>
            <DialogFooter>
              <Button onClick={() => saveEntry.mutate(form)} disabled={saveEntry.isPending}>
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
