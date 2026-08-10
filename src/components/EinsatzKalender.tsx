import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { ChevronLeft, ChevronRight, HeartPulse, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  ABSENCE_REASONS,
  absenceClasses,
  absenceLabel,
  absenceReason,
  absenceShort,
  isAbsence,
  type AbsenceReason,
  type EntryType,
} from "@/lib/absence";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const NO_PROJECT = "__none__";


export type KalenderEmployee = { id: string; name: string; hourly_rate: number | null };
export type KalenderProject = { id: string; name: string | null; city?: string | null };

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

/** Stunden aus "HH:MM" Start/Ende minus Pause (Minuten). */
function hoursFromTimes(start: string, end: string, breakMinutes: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins < 0) mins += 24 * 60;
  mins -= breakMinutes;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

type PlanForm = {
  employeeId: string;
  entryType: EntryType;
  absenceReason: AbsenceReason;
  projectId: string;
  location: string;
  start: string;
  end: string;
  breakMinutes: string;
  note: string;
};

const emptyForm: PlanForm = {
  employeeId: "",
  entryType: "work",
  absenceReason: "vacation",
  projectId: NO_PROJECT,
  location: "",
  start: "08:00",
  end: "16:00",
  breakMinutes: "30",
  note: "",
};


export function EinsatzKalender({
  employees,
  projects,
}: {
  employees: KalenderEmployee[];
  projects: KalenderProject[];
}) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [day, setDay] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const first = monthStart(month);
  const gridStart = useMemo(() => {
    const d = new Date(first);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [first]);

  const days = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart],
  );

  const rangeFrom = isoDay(days[0]!);
  const rangeTo = isoDay(days[41]!);

  const { data: entries = [] } = useQuery({
    queryKey: ["time_entries", "calendar", rangeFrom, rangeTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .gte("work_date", rangeFrom)
        .lte("work_date", rangeTo)
        .order("start_time", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["time_entries"] });
  };

  const createPlan = useMutation({
    mutationFn: async (values: PlanForm & { workDate: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const employee = employees.find((e) => e.id === values.employeeId);
      if (!employee) throw new Error("Bitte einen Mitarbeiter wählen.");
      const absence = values.entryType === "absence";
      const breakMinutes = absence ? 0 : Number(values.breakMinutes.replace(",", ".")) || 0;
      const hours = absence ? 0 : hoursFromTimes(values.start, values.end, breakMinutes);
      if (!absence && hours <= 0)
        throw new Error("Bitte gültige Start- und Endzeit eintragen.");
      const project =
        absence || values.projectId === NO_PROJECT
          ? null
          : projects.find((p) => p.id === values.projectId) || null;
      const { error } = await supabase.from("time_entries").insert({
        user_id: userId,
        employee_id: employee.id,
        employee_name: employee.name,
        work_date: values.workDate,
        start_time: absence ? null : values.start,
        end_time: absence ? null : values.end,
        break_minutes: breakMinutes,
        hours,
        hourly_rate: Number(employee.hourly_rate ?? 0),
        project_id: project?.id ?? null,
        location: absence ? absenceLabel(values.absenceReason) : project?.name || values.location.trim(),
        note: values.note.trim(),
        entry_type: values.entryType,
        absence_reason: absence ? values.absenceReason : "",
      });
      if (error) throw error;
    },
    onSuccess: (_d, values) => {
      toast.success(values.entryType === "absence" ? "Abwesenheit eingetragen" : "Einsatz geplant");
      setDay(null);
      setForm(emptyForm);

      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einsatz entfernt");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = map.get(e.work_date) ?? [];
      list.push(e);
      map.set(e.work_date, list);
    }
    return map;
  }, [entries]);

  const today = isoDay(new Date());
  const shiftMonth = (delta: number) =>
    setMonth(new Date(first.getFullYear(), first.getMonth() + delta, 1, 12));

  const dayEntries = day ? (byDay.get(day) ?? []) : [];

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Einsatz-Kalender</h2>
          <p className="text-sm text-muted-foreground">
            Tag anklicken und Mitarbeiter, Objekt sowie Arbeitszeit planen – synchron mit der
            Wochenübersicht.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {first.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setMonth(monthStart(new Date()))}>
            Heute
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = isoDay(d);
          const inMonth = d.getMonth() === first.getMonth();
          const list = byDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setForm({ ...emptyForm, employeeId: employees[0]?.id ?? "" });
                setDay(key);
              }}
              className={`min-h-[92px] bg-background p-1.5 text-left transition hover:bg-accent/60 ${
                inMonth ? "" : "opacity-45"
              } ${key === today ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${key === today ? "font-bold text-primary" : ""}`}>
                  {d.getDate()}
                </span>
                {list.length > 0 && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                    {list.length}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="truncate rounded bg-primary/10 px-1 py-0.5 text-[11px] leading-tight text-primary"
                    title={`${e.employee_name} · ${e.location || "ohne Objekt"}`}
                  >
                    {(e.start_time ?? "").slice(0, 5)} {e.employee_name}
                  </div>
                ))}
                {list.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{list.length - 3} weitere</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={day !== null} onOpenChange={(o) => !o && setDay(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Einsatz planen – {day ? formatDate(day) : ""}</DialogTitle>
          </DialogHeader>

          {dayEntries.length > 0 && (
            <ul className="divide-y rounded-md border">
              {dayEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {(e.start_time ?? "").slice(0, 5)}–{(e.end_time ?? "").slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{e.employee_name}</span>
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                  <span className="shrink-0">{Number(e.hours ?? 0).toFixed(2)} Std.</span>
                  <Button variant="ghost" size="icon" onClick={() => removePlan.mutate(e.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Mitarbeiter</Label>
              <Select
                value={form.employeeId}
                onValueChange={(v) => setForm({ ...form, employeeId: v })}
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
              <Label>Objekt / Projekt</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm({ ...form, projectId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>Kein Projekt (Freitext)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || "Ohne Namen"}
                      {p.city ? ` · ${p.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-loc">Einsatzort (Freitext)</Label>
              <Input
                id="k-loc"
                value={form.location}
                disabled={form.projectId !== NO_PROJECT}
                placeholder="z. B. Musterstraße 5, Treppenhaus"
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-start">Von (HH:MM)</Label>
              <Input
                id="k-start"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k-end">Bis (HH:MM)</Label>
              <Input
                id="k-end"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
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
            Geplante Dauer:{" "}
            <span className="font-medium text-foreground">
              {hoursFromTimes(
                form.start,
                form.end,
                Number(form.breakMinutes.replace(",", ".")) || 0,
              ).toFixed(2)}{" "}
              Std.
            </span>
          </p>

          <DialogFooter>
            <Button
              onClick={() => day && createPlan.mutate({ ...form, workDate: day })}
              disabled={!form.employeeId || createPlan.isPending}
            >
              <Plus className="size-4" /> Einsatz eintragen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
