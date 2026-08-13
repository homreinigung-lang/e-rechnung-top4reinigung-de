import { Fragment, useMemo, useState } from "react";
import { isoWeek } from "@/lib/kw";

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
import { AbwesenheitZeitraum } from "@/components/AbwesenheitZeitraum";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const NO_PROJECT = "__none__";
const ALL = "__all__";

export type KalenderEmployee = {
  id: string;
  name: string;
  hourly_rate: number | null;
  weekly_hours?: number | null;
};
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
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [filterEmployee, setFilterEmployee] = useState<string>(ALL);
  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [day, setDay] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const first = monthStart(anchor);
  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [anchor]);

  const gridStart = useMemo(() => {
    if (view === "week") return weekStart;
    const d = new Date(first);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(12, 0, 0, 0);
    return d;
  }, [first, weekStart, view]);

  const days = useMemo(
    () =>
      Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [gridStart, view],
  );

  const rangeFrom = isoDay(days[0]!);
  const rangeTo = isoDay(days[days.length - 1]!);

  const { data: allEntries = [] } = useQuery({
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

  /** Anzeige nach Mitarbeiter- und Projektfilter eingeschränkt. */
  const entries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          (filterEmployee === ALL || e.employee_id === filterEmployee) &&
          (filterProject === ALL || e.project_id === filterProject),
      ),
    [allEntries, filterEmployee, filterProject],
  );

  const visibleEmployees = useMemo(
    () => (filterEmployee === ALL ? employees : employees.filter((e) => e.id === filterEmployee)),
    [employees, filterEmployee],
  );

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
      if (!absence && hours <= 0) throw new Error("Bitte gültige Start- und Endzeit eintragen.");
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
        location: absence
          ? absenceLabel(values.absenceReason)
          : project?.name || values.location.trim(),
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

  const shift = (delta: number) => {
    if (view === "week") {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + delta * 7);
      setAnchor(d);
    } else {
      setAnchor(new Date(first.getFullYear(), first.getMonth() + delta, 1, 12));
    }
  };

  const periodLabel =
    view === "week"
      ? `KW ${isoWeek(weekStart)} · ${formatDate(isoDay(days[0]!))} – ${formatDate(isoDay(days[6]!))}`
      : first.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });

  /** Ist-Stunden (nur Arbeitseinsätze) je Mitarbeiter im sichtbaren Zeitraum. */
  const actualByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isAbsence(e) || !e.employee_id) continue;
      map.set(e.employee_id, (map.get(e.employee_id) ?? 0) + Number(e.hours ?? 0));
    }
    return map;
  }, [entries]);

  /** Soll-Stunden aus dem Vertrag: Woche = Wochenstunden, Monat = Wochenstunden × 4,33. */
  const plannedFor = (emp: KalenderEmployee) =>
    Number(emp.weekly_hours ?? 0) * (view === "week" ? 1 : 4.33);

  const dayEntries = day ? (byDay.get(day) ?? []) : [];
  const isAbsent = form.entryType === "absence";

  const openDay = (key: string, employeeId?: string) => {
    setForm({
      ...emptyForm,
      employeeId: employeeId ?? (filterEmployee !== ALL ? filterEmployee : (employees[0]?.id ?? "")),
      projectId: filterProject !== ALL ? filterProject : NO_PROJECT,
    });
    setDay(key);
  };

  return (
    <section className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Einsatz-Kalender</h2>
          <p className="text-sm text-muted-foreground">
            Monats- oder Wochenansicht, Einsatzort je Zeitfenster sowie Soll-/Ist-Stunden je
            Mitarbeiter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={view === "month" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("month")}
            >
              Monat
            </Button>
            <Button
              variant={view === "week" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("week")}
            >
              Woche
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">{periodLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const d = new Date();
              d.setHours(12, 0, 0, 0);
              setAnchor(d);
            }}
          >
            Heute
          </Button>
          <AbwesenheitZeitraum employees={employees} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle Mitarbeiter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Mitarbeiter</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alle Objekte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Objekte / Projekte</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "Ohne Namen"}
                {p.city ? ` · ${p.city}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterEmployee !== ALL || filterProject !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterEmployee(ALL);
              setFilterProject(ALL);
            }}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg border bg-border text-sm">
          <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">KW</div>
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
          {days.map((d, index) => {
            const key = isoDay(d);
            const inMonth = d.getMonth() === first.getMonth();
            const list = byDay.get(key) ?? [];
            return (
              <Fragment key={key}>
                {index % 7 === 0 && (
                  <div
                    className="flex items-center justify-center bg-muted/40 px-1 py-1.5 text-xs font-medium text-muted-foreground"
                    title={`Kalenderwoche ${isoWeek(d)}`}
                  >
                    {isoWeek(d)}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openDay(key)}
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
                    {list.slice(0, 3).map((e) => {
                      const reason = absenceReason(e);
                      return (
                        <div
                          key={e.id}
                          className={`flex items-center gap-1 truncate rounded border px-1 py-0.5 text-[11px] leading-tight ${
                            reason
                              ? absenceClasses(reason)
                              : "border-transparent bg-primary/10 text-primary"
                          }`}
                          title={
                            reason
                              ? `${e.employee_name} · ${absenceLabel(reason)}`
                              : `${e.employee_name} · ${e.location || "ohne Objekt"}`
                          }
                        >
                          {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                          <span className="truncate">
                            {reason ? absenceShort(reason) : (e.start_time ?? "").slice(0, 5)}{" "}
                            {e.employee_name}
                            {!reason && e.location ? ` · ${e.location}` : ""}
                          </span>
                        </div>
                      );
                    })}
                    {list.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{list.length - 3} weitere
                      </div>
                    )}
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[56rem] grid-cols-[12rem_repeat(7,minmax(0,1fr))] gap-px rounded-lg border bg-border text-sm">
            <div className="bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Mitarbeiter · Soll / Ist
            </div>
            {days.map((d, i) => (
              <div
                key={isoDay(d)}
                className={`bg-muted/60 px-2 py-1.5 text-xs font-medium ${
                  isoDay(d) === today ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {WEEKDAYS[i]} {d.getDate()}.{d.getMonth() + 1}.
              </div>
            ))}

            {visibleEmployees.length === 0 && (
              <div className="col-span-8 bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                Keine Mitarbeiter für diesen Filter.
              </div>
            )}

            {visibleEmployees.map((emp) => {
              const actual = actualByEmployee.get(emp.id) ?? 0;
              const planned = plannedFor(emp);
              const diff = actual - planned;
              return (
                <Fragment key={emp.id}>
                  <div className="bg-background px-2 py-2">
                    <div className="truncate font-medium">{emp.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Soll {planned.toFixed(2)} · Ist {actual.toFixed(2)} Std.
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        diff < 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {diff >= 0 ? "+" : ""}
                      {diff.toFixed(2)} Std.
                    </div>
                  </div>
                  {days.map((d) => {
                    const key = isoDay(d);
                    const list = (byDay.get(key) ?? []).filter((e) => e.employee_id === emp.id);
                    return (
                      <button
                        key={`${emp.id}-${key}`}
                        type="button"
                        onClick={() => openDay(key, emp.id)}
                        className={`min-h-[76px] space-y-0.5 bg-background p-1 text-left align-top transition hover:bg-accent/60 ${
                          key === today ? "ring-1 ring-inset ring-primary" : ""
                        }`}
                      >
                        {list.map((e) => {
                          const reason = absenceReason(e);
                          return (
                            <div
                              key={e.id}
                              className={`rounded border px-1 py-0.5 text-[11px] leading-tight ${
                                reason
                                  ? absenceClasses(reason)
                                  : "border-transparent bg-primary/10 text-primary"
                              }`}
                            >
                              {reason ? (
                                <span className="flex items-center gap-1">
                                  {reason === "sick" && <HeartPulse className="size-3 shrink-0" />}
                                  {absenceLabel(reason)}
                                </span>
                              ) : (
                                <>
                                  <div className="font-medium">
                                    {(e.start_time ?? "").slice(0, 5)}–
                                    {(e.end_time ?? "").slice(0, 5)}
                                  </div>
                                  <div className="truncate">{e.location || "ohne Objekt"}</div>
                                  <div className="text-[10px] opacity-80">
                                    {Number(e.hours ?? 0).toFixed(2)} Std.
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}


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
                    <Button variant="ghost" size="icon" onClick={() => removePlan.mutate(e.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </li>
                );
              })}
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
                  {hoursFromTimes(
                    form.start,
                    form.end,
                    Number(form.breakMinutes.replace(",", ".")) || 0,
                  ).toFixed(2)}{" "}
                  Std.
                </span>
              </>
            )}
          </p>

          <DialogFooter>
            <Button
              onClick={() => day && createPlan.mutate({ ...form, workDate: day })}
              disabled={!form.employeeId || createPlan.isPending}
            >
              <Plus className="size-4" /> {isAbsent ? "Abwesenheit eintragen" : "Einsatz eintragen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
