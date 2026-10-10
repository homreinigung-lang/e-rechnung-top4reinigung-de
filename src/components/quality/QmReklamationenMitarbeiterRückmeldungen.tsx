import { QmFeedbackList } from "@/components/QmEmployeeTasks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileUploadButton } from "@/components/FileUploadButton";
import { openStoredFile } from "@/lib/storage";

import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { statusLabel, priorityLabel, categoryLabel } from "./shared";

import type { QmReklamationenState } from "./useQmReklamationenState";
export function QmReklamationenMitarbeiterRückmeldungen({
  state,
}: {
  state: QmReklamationenState;
}) {
  const {
    compatibleProjects,
    customers,
    employees,
    events,
    form,
    open,
    projects,
    save,
    setForm,
    setOpen,
  } = state;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Reklamation bearbeiten" : "Neue Reklamation"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Titel</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Kunde</Label>
            <Select
              value={form.customer_id || "__none__"}
              onValueChange={(value) => {
                const customerId = value === "__none__" ? "" : value;
                const currentProject = projects.find((p) => p.id === form.project_id);
                setForm({
                  ...form,
                  customer_id: customerId,
                  project_id: currentProject?.customer_id === customerId ? form.project_id : "",
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kein Kunde</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Objekt</Label>
            <Select
              value={form.project_id || "__none__"}
              onValueChange={(v) => setForm({ ...form, project_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Kein Objekt</SelectItem>
                {compatibleProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name || "Ohne Namen"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Kategorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabel).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priorität</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(priorityLabel).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabel).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Verantwortlich</Label>
            <Select
              value={form.assigned_employee_id || "__none__"}
              onValueChange={(v) =>
                setForm({ ...form, assigned_employee_id: v === "__none__" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nicht zugeordnet</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vorfalldatum</Label>
            <Input
              type="date"
              value={form.occurred_at}
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Frist</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Beschreibung</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Arbeitsauftrag für den Mitarbeiter</Label>
            <Textarea
              rows={3}
              maxLength={4000}
              value={form.employee_instruction}
              onChange={(e) => setForm({ ...form, employee_instruction: e.target.value })}
              placeholder="Welche Nacharbeit soll der Mitarbeiter ausführen?"
            />
            <p className="text-xs text-muted-foreground">
              Mit Mitarbeiterzuordnung und Arbeitsauftrag wird die Aufgabe beim Speichern
              automatisch im Mitarbeiterportal angezeigt: Titel, Objekt, Priorität, Frist und dieser
              Text. Beschreibung und interne Notiz bleiben bei der Verwaltung. Ohne Zuordnung ist
              die Aufgabe nicht veröffentlicht.
            </p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Maßnahme / interne Notiz</Label>
            <Textarea
              rows={3}
              value={form.action_note}
              onChange={(e) => setForm({ ...form, action_note: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Lösung / Abschluss</Label>
            <Textarea
              rows={3}
              value={form.solution}
              onChange={(e) => setForm({ ...form, solution: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Anhänge / Fotos</Label>
            <div className="flex flex-wrap gap-2">
              <FileUploadButton
                folder="qm-reklamationen"
                accept="image/*,application/pdf"
                label="Datei anhängen"
                onUploaded={(path) =>
                  setForm((current) => ({
                    ...current,
                    attachment_paths: [...current.attachment_paths, path],
                  }))
                }
              />
              {form.attachment_paths.map((path, index) => (
                <Button
                  key={path}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openStoredFile(path)}
                >
                  <FileText className="size-4" /> Anlage {index + 1}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {form.id && (
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="font-semibold">Mitarbeiter-Rückmeldungen</h3>
            <p className="text-xs text-muted-foreground">
              Prüfen Sie die Rückmeldung und Fotos. Nur die Verwaltung schließt den Fall ab;
              Statusänderungen gelten erst nach dem Speichern.
            </p>
            <QmFeedbackList
              caseId={form.id}
              currentEmployeeId={form.assigned_employee_id}
              employeeNames={Object.fromEntries(employees.map((e) => [e.id, e.name]))}
              onComplete={
                form.status === "erledigt"
                  ? undefined
                  : (message) => {
                      setForm((current) => ({
                        ...current,
                        status: "erledigt",
                        solution: current.solution || message,
                      }));
                      toast.info("Abschluss vorbereitet. Bitte prüfen und speichern.");
                    }
              }
            />
          </section>
        )}
        {form.id && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ClipboardCheck className="size-4" /> Verlauf
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Verlaufseinträge.</p>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 12).map((event) => (
                  <div key={event.id} className="text-sm">
                    <span className="font-medium">{event.event_type}</span>{" "}
                    <span className="text-muted-foreground">
                      {new Date(event.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {form.status === "erledigt" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
