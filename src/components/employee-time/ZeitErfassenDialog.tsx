import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useOfflineTime } from "@/hooks/useOfflineTime";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Clock } from "lucide-react";

import { type DayTask } from "@/components/MeinEinsatzkalender";

export function ZeitErfassenDialog({
  employee,
  projects,
  assignments,
  task,
}: {
  task?: DayTask | undefined;
  employee: { id: string; name: string; user_id: string; hourly_rate?: number | null };
  projects: {
    id: string;
    name: string;
    city: string;
    address_line: string;
    postal_code: string;
    customer_name?: string;
  }[];
  assignments: { project_id: string | null }[];
}) {
  const queryClient = useQueryClient();
  const offline = useOfflineTime(employee.id);
  const [open, setOpen] = useState(false);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [note, setNote] = useState("");

  /** Zuerst die eigenen Einsatzorte, danach alle übrigen Objekte. */
  const options = useMemo(() => {
    const mine = new Set(assignments.map((a) => a.project_id).filter(Boolean) as string[]);
    return [...projects].sort((a, b) => {
      const d = (mine.has(b.id) ? 1 : 0) - (mine.has(a.id) ? 1 : 0);
      return d !== 0 ? d : a.name.localeCompare(b.name, "de-DE");
    });
  }, [projects, assignments]);

  const hours = useMemo(() => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
    let minutes = eh! * 60 + em! - (sh! * 60 + sm!);
    if (minutes < 0) minutes += 24 * 60; // Nachtschicht über Mitternacht
    minutes -= Math.max(0, Number(breakMinutes) || 0);
    return Math.max(0, Math.round((minutes / 60) * 100) / 100);
  }, [start, end, breakMinutes]);

  const reset = () => {
    setProjectId("");
    setLocation("");
    setStart("08:00");
    setEnd("16:00");
    setBreakMinutes("30");
    setNote("");
  };

  useEffect(() => {
    if (!open || !task) return;
    setWorkDate(task.date);
    setProjectId(task.projectId ?? "");
    setStart(task.start);
    setEnd(task.end);
    setBreakMinutes(String(task.breakMin));
  }, [open, task]);

  const save = useMutation({
    mutationFn: async () => {
      if (hours <= 0) throw new Error("Bitte eine gültige Arbeitszeit angeben.");
      const project = projects.find((p) => p.id === projectId);
      return offline.save({
        user_id: employee.user_id,
        employee_id: employee.id,
        employee_name: employee.name,
        entry_type: "work",
        work_date: workDate,
        start_time: start,
        end_time: end,
        break_minutes: Math.max(0, Number(breakMinutes) || 0),
        hours,
        hourly_rate: Number(employee.hourly_rate ?? 0),
        project_id: projectId || null,
        location: location.trim() || project?.name || "",
        note: note.trim(),
        billed: false,
        approval_status: "pending",
      });
    },
    onSuccess: (queued) => {
      toast.success(
        queued
          ? "Auf diesem Gerät gespeichert – wartet auf Synchronisierung"
          : `Arbeitszeit erfasst – ${hours.toFixed(2)} Std.`,
      );
      queryClient.invalidateQueries({ queryKey: ["my_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  return (
    <>
      {(!offline.online || offline.pending > 0) && (
        <div role="status" className="rounded-md border p-3 text-sm">
          {offline.pending} Arbeitszeiten auf diesem Gerät warten auf Synchronisierung.
          {!offline.online &&
            " Keine Internetverbindung. Zum Erfassen die bereits geöffnete Seite verwenden."}
          {offline.error && <p className="text-destructive">{offline.error}</p>}
          <ul className="my-2">
            {offline.entries.map((entry) => (
              <li key={entry.id}>
                {entry.row.work_date} · {entry.row.start_time}–{entry.row.end_time} ·{" "}
                {Number(entry.row.hours).toFixed(2)} Std. · {entry.row.location}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            disabled={!offline.online || offline.syncing}
            onClick={() => void offline.sync()}
          >
            {offline.syncing ? "Synchronisiert …" : "Jetzt synchronisieren"}
          </Button>
          <p>Bis zur Synchronisierung keine Browserdaten löschen.</p>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Clock className="size-4" /> {task ? "Tatsächliche Zeit erfassen" : "Zeit erfassen"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Arbeitszeit erfassen</DialogTitle>
            <DialogDescription>
              Erfassen Sie Ihre Arbeitszeit als Zeitraum (Von–Bis). Die Stunden werden automatisch
              abzüglich der Pause berechnet.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="ze-datum">Datum</Label>
                <Input
                  id="ze-datum"
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ze-objekt">Objekt / Einsatzort</Label>
                <select
                  id="ze-objekt"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-0 h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">— ohne Objekt —</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.city ? ` · ${p.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor="ze-von">Von</Label>
                <Input
                  id="ze-von"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ze-bis">Bis</Label>
                <Input
                  id="ze-bis"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ze-pause">Pause (Min.)</Label>
                <Input
                  id="ze-pause"
                  type="number"
                  min={0}
                  step={5}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="ze-ort">Freitext-Einsatzort (optional)</Label>
              <Input
                id="ze-ort"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="z. B. Baustelle Saarbrücken, Hauptstraße 5"
              />
            </div>

            <div>
              <Label htmlFor="ze-notiz">Tätigkeit / Notiz</Label>
              <Textarea
                id="ze-notiz"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="z. B. Unterhaltsreinigung Erdgeschoss"
              />
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Berechnete Arbeitszeit: <span className="font-semibold">{hours.toFixed(2)} Std.</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || hours <= 0}>
              {save.isPending ? "Wird gespeichert …" : "Zeit speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
