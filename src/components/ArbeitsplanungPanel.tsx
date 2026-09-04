import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  MapPin,
  Navigation,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  Send,
  Save,
} from "lucide-react";
import { mapsUrl, projectAddress } from "@/lib/maps";
import { isoWeek, isoWeekYear } from "@/lib/kw";
import {
  DAY_LABELS,
  normalizeDayHours,
  normalizeDayTimes,
  timeToHours,
  formatDayTime,
  EMPTY_DAY_TIME,
  type DayTime,
} from "@/lib/planung";
import { formatDate } from "@/lib/format";
import { friendlyDbError } from "@/lib/db-errors";
import { LoadError, firstError } from "@/components/LoadError";

/**
 * Schnellauswahl: eine Zeitvorlage auf die ganze Woche (Mo–Fr bzw. Mo–So)
 * übernehmen, damit nicht jeder Tag einzeln gepflegt werden muss.
 */
function WeekQuickFill({
  onApply,
  onClear,
}: {
  onApply: (template: DayTime, dayCount: number) => void;
  onClear: () => void;
}) {
  const [start, setStart] = React.useState("08:00");
  const [end, setEnd] = React.useState("16:00");
  const [breakMin, setBreakMin] = React.useState(30);

  const apply = (dayCount: number) => {
    if (!start || !end) {
      toast.error("Bitte Von- und Bis-Zeit angeben.");
      return;
    }
    onApply({ start, end, breakMin: Math.max(0, breakMin) }, dayCount);
  };

  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <div className="text-xs font-semibold">Ganze Woche übernehmen</div>
      <div className="mt-1 grid grid-cols-[1fr_1fr_3.2rem] gap-1">
        <Input
          type="time"
          value={start}
          onChange={(ev) => setStart(ev.target.value)}
          className="h-8 px-1 text-xs"
          aria-label="Von (ganze Woche)"
        />
        <Input
          type="time"
          value={end}
          onChange={(ev) => setEnd(ev.target.value)}
          className="h-8 px-1 text-xs"
          aria-label="Bis (ganze Woche)"
        />
        <Input
          type="number"
          min={0}
          step="5"
          value={breakMin ? String(breakMin) : ""}
          placeholder="0"
          onChange={(ev) => setBreakMin(Number(ev.target.value) || 0)}
          className="h-8 px-1 text-center text-xs"
          aria-label="Pause (ganze Woche)"
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="secondary" onClick={() => apply(5)}>
          Mo–Fr
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => apply(7)}>
          Mo–So
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Leeren
        </Button>
      </div>
    </div>
  );
}

type Employee = {
  id: string;
  name: string;
  role: string;
  weekly_hours: number | null;
  user_id: string;
};

type Project = {
  id: string;
  name: string | null;
  city: string | null;
  address_line: string | null;
  postal_code: string | null;
  status: string | null;
  customer_id?: string | null;
};

type Customer = {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  address_line: string | null;
  postal_code: string | null;
};

type GridObject = Project & { customerId?: string; virtual?: boolean };

type Assignment = {
  id: string;
  project_id: string;
  employee_id: string;
  hours_per_week: number | null;
  day_hours: unknown;
  day_times?: unknown;
  assignment_role: string | null;
  start_date: string | null;
  end_date: string | null;
};

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Montag der Woche zum übergebenen Datum. */
function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(12, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function Arbeitsplanung() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState("");
  const [monday, setMonday] = React.useState(() => mondayOf(new Date()));
  const weekStart = isoDay(monday);
  const weekEnd = isoDay(addDays(monday, 6));

  const { data: employees = [], error: employeesError } = useQuery({
    queryKey: ["employees", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,role,weekly_hours,user_id")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const { data: projects = [], error: projectsError } = useQuery({
    queryKey: ["projects", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,address_line,postal_code,status,customer_id")
        .order("name");
      if (error) throw error;
      return data as Project[];
    },
  });

  const { data: customers = [], error: customersError } = useQuery({
    queryKey: ["customers", "planung"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,company,city,address_line,postal_code")
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const { data: assignments = [], error: assignmentsError } = useQuery({
    queryKey: ["project_assignments", "planung", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_assignments")
        .select(
          "id,project_id,employee_id,hours_per_week,day_hours,day_times,assignment_role,start_date,end_date",
        )
        .eq("start_date", weekStart);
      if (error) throw error;
      return data as Assignment[];
    },
  });

  const { data: release, isLoading: releaseLoading } = useQuery({
    queryKey: ["plan_release", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_releases")
        .select("id,week_start,released_at")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; week_start: string; released_at: string } | null;
    },
  });

  const releaseWeek = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("plan_releases").upsert(
        {
          user_id: uid,
          week_start: weekStart,
          week_end: weekEnd,
          released_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan_release"] });
      toast.success(`Woche freigegeben – Mitarbeitende wurden benachrichtigt.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawRelease = useMutation({
    mutationFn: async () => {
      if (!release) return;
      const { error } = await supabase.from("plan_releases").delete().eq("id", release.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan_release"] });
      toast.success("Freigabe zurückgenommen.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const objects = React.useMemo<GridObject[]>(() => {
    const linked = new Set(
      projects.map((p) => (p as Project & { customer_id?: string }).customer_id).filter(Boolean),
    );
    const fromCustomers: GridObject[] = customers
      .filter((c) => !linked.has(c.id))
      .map((c) => ({
        id: `c:${c.id}`,
        name: c.company || c.name,
        city: c.city,
        address_line: c.address_line,
        postal_code: c.postal_code,
        status: null,
        customerId: c.id,
        virtual: true,
      }));
    return [...projects, ...fromCustomers];
  }, [projects, customers]);

  const key = (e: string, p: string) => `${e}|${p}`;
  const map = React.useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of assignments) m.set(key(a.employee_id, a.project_id), a);
    return m;
  }, [assignments]);

  // Entwurf: eingegebene Zeiten bleiben lokal, bis „Speichern" gedrückt wird.
  const [draft, setDraft] = React.useState<Record<string, DayTime[]>>({});
  const [cellErrors, setCellErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setDraft({});
  }, [weekStart]);

  const savedTimes = (e: string, p: string) => {
    const a = map.get(key(e, p));
    return normalizeDayTimes(a?.day_times);
  };

  /** Fallback für Altbestand ohne Von-/Bis-Zeiten. */
  const savedFallbackHours = (e: string, p: string) => {
    const a = map.get(key(e, p));
    if (!a) return normalizeDayHours(null);
    const days = normalizeDayHours(a.day_hours);
    const total = days.reduce((s, n) => s + n, 0);
    if (total === 0 && Number(a.hours_per_week ?? 0) > 0) {
      const per = Number(a.hours_per_week) / 5;
      return [per, per, per, per, per, 0, 0];
    }
    return days;
  };

  const cellTimes = (e: string, p: string) => draft[key(e, p)] ?? savedTimes(e, p);

  const cellDayHours = (e: string, p: string) => {
    const fromTimes = cellTimes(e, p).map((t) => timeToHours(t));
    if (fromTimes.some((h) => h > 0)) return fromTimes;
    return draft[key(e, p)] ? fromTimes : savedFallbackHours(e, p);
  };

  const cellHours = (e: string, p: string) =>
    cellDayHours(e, p).reduce((s, n) => s + (Number(n) || 0), 0);

  const setDayTime = (e: string, p: string, index: number, patch: Partial<DayTime>) =>
    setDraft((d) => {
      const current = [...(d[key(e, p)] ?? savedTimes(e, p))];
      current[index] = { ...(current[index] ?? EMPTY_DAY_TIME), ...patch };
      return { ...d, [key(e, p)]: current };
    });

  /**
   * Ganze Woche auf einmal setzen: übernimmt eine Zeitvorlage auf die
   * gewünschten Wochentage (Mo–Fr oder Mo–So) bzw. leert alle Tage.
   */
  const applyWeekTimes = (e: string, p: string, template: DayTime, dayCount: number) =>
    setDraft((d) => {
      const current = [...(d[key(e, p)] ?? savedTimes(e, p))];
      const next = Array.from({ length: 7 }, (_, i) =>
        i < dayCount ? { ...template } : (current[i] ?? { ...EMPTY_DAY_TIME }),
      );
      return { ...d, [key(e, p)]: next };
    });

  const clearWeekTimes = (e: string, p: string) =>
    setDraft((d) => ({
      ...d,
      [key(e, p)]: Array.from({ length: 7 }, () => ({ ...EMPTY_DAY_TIME })),
    }));

  const dirtyKeys = React.useMemo(
    () =>
      Object.keys(draft).filter((k) => {
        const [e, p] = k.split("|");
        return JSON.stringify(draft[k]) !== JSON.stringify(savedTimes(e!, p!));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, map],
  );

  async function persistCell(employee: Employee, object: GridObject, times: DayTime[]) {
    const days = times.map((t) => timeToHours(t));
    const hours = days.reduce((s, n) => s + (Number(n) || 0), 0);
    const existing = map.get(key(employee.id, object.id));
    if (hours <= 0) {
      if (existing) {
        const { error } = await supabase.from("project_assignments").delete().eq("id", existing.id);
        if (error) throw error;
      }
      return;
    }
    if (existing) {
      const { error } = await supabase
        .from("project_assignments")
        .update({ hours_per_week: hours, day_hours: days, day_times: times })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    let projectId = object.id;
    if (object.virtual) {
      const customer = customers.find((c) => c.id === object.customerId);
      const { data: created, error: pErr } = await supabase
        .from("projects")
        .insert({
          user_id: employee.user_id,
          name: object.name ?? "Objekt",
          mode: "grundriss",
          customer_id: object.customerId ?? null,
          customer_name: customer ? customer.company || customer.name : "",
          address_line: object.address_line ?? "",
          postal_code: object.postal_code ?? "",
          city: object.city ?? "",
        })
        .select("id")
        .single();
      if (pErr) throw pErr;
      projectId = created.id;
    }
    // Upsert anhand (Projekt, Mitarbeiter, Wochenstart): existiert für diese Woche
    // schon ein Eintrag, wird er aktualisiert – sonst neu angelegt.
    const { error } = await supabase.from("project_assignments").upsert(
      {
        project_id: projectId,
        employee_id: employee.id,
        user_id: employee.user_id,
        hours_per_week: hours,
        day_hours: days,
        day_times: times,
        start_date: weekStart,
        end_date: weekEnd,
      },
      { onConflict: "project_id,employee_id,start_date" },
    );
    if (error) throw error;
  }

  const saveAll = useMutation({
    mutationFn: async () => {
      // Jede Zelle einzeln speichern: Konflikte (z. B. Überschneidungen) dürfen
      // nicht den gesamten Wochenplan verwerfen.
      const failures: { key: string; label: string; message: string }[] = [];
      const savedKeys: string[] = [];
      for (const k of dirtyKeys) {
        const [eid, pid] = k.split("|");
        const employee = employees.find((e) => e.id === eid);
        const object = objects.find((o) => o.id === pid);
        if (!employee || !object) continue;
        try {
          await persistCell(employee, object, draft[k] ?? normalizeDayTimes(null));
          savedKeys.push(k);
        } catch (err) {
          failures.push({
            key: k,
            label: `${employee.name} – ${object.name || "Objekt"}`,
            message: friendlyDbError(err, "Zelle konnte nicht gespeichert werden."),
          });
        }
      }
      return { failures, savedKeys };
    },

    onSuccess: ({ failures, savedKeys }) => {
      // Nur erfolgreich gespeicherte Zellen aus dem Entwurf entfernen.
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of savedKeys) delete next[k];
        return next;
      });
      setCellErrors(Object.fromEntries(failures.map((f) => [f.key, f.message])));
      queryClient.invalidateQueries({ queryKey: ["project_assignments"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (failures.length === 0) {
        toast.success("Wochenplan gespeichert (Entwurf).");
      } else {
        toast.error(
          `${failures.length} von ${failures.length + savedKeys.length} Einträgen konnten nicht gespeichert werden.`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibleProjects = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((p) =>
      `${p.name ?? ""} ${p.city ?? ""} ${p.address_line ?? ""}`.toLowerCase().includes(q),
    );
  }, [objects, filter]);

  const employeeTotal = (id: string) => objects.reduce((s, o) => s + cellHours(id, o.id), 0);

  const projectTotal = (id: string) => employees.reduce((s, e) => s + cellHours(e.id, id), 0);

  const grandTotal = employees.reduce((s, e) => s + employeeTotal(e.id), 0);

  const loadError = firstError(employeesError, projectsError, customersError, assignmentsError);
  const cellErrorList = Object.entries(cellErrors);

  return (
    <div className="space-y-6">
      <LoadError
        error={loadError}
        title="Planungsdaten konnten nicht geladen werden"
        onRetry={() => void queryClient.invalidateQueries()}
      />
      {cellErrorList.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Diese Einträge konnten nicht gespeichert werden:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {cellErrorList.map(([key, message]) => {
              const [eid, pid] = key.split("|");
              const emp = employees.find((e) => e.id === eid)?.name ?? "Mitarbeiter";
              const obj = objects.find((o) => o.id === pid)?.name ?? "Objekt";
              return (
                <li key={key}>
                  <span className="font-medium">
                    {emp} – {obj}:
                  </span>{" "}
                  {message}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold">Arbeitsplanung</h1>
        <p className="mt-1 text-muted-foreground">
          Auf eine Zelle klicken und Stunden je Wochentag (Mo–So) eintragen – die Wochensumme wird
          automatisch berechnet und nach der Freigabe im Mitarbeiterportal angezeigt.
        </p>
      </div>

      <div className="surface flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Vorherige Woche"
            onClick={() => setMonday((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[220px] text-center">
            <div className="flex items-center justify-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" />
              KW {isoWeek(monday)} / {isoWeekYear(monday)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(weekStart)} – {formatDate(weekEnd)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Nächste Woche"
            onClick={() => setMonday((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMonday(mondayOf(new Date()))}>
            Aktuelle Woche
          </Button>
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setMonday(mondayOf(new Date(`${v}T12:00:00`)));
            }}
            className="h-9 w-[170px]"
          />
        </div>
        <Input
          placeholder="Objekt suchen (Name, Ort, Adresse) …"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {release ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          ) : (
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              KW {isoWeek(monday)}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  release ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {release ? "Freigegeben" : "Entwurf"}
              </span>
              {dirtyKeys.length > 0 && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  Ungespeicherte Änderungen
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {release
                ? `Freigegeben am ${formatDate(release.released_at.slice(0, 10))} – Mitarbeitende sehen diesen Plan in ihrem Konto.`
                : "Entwurf: nur intern sichtbar. Erst nach der Freigabe erscheint der Plan bei den Mitarbeitenden."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending || dirtyKeys.length === 0}
          >
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </Button>
          {release && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => withdrawRelease.mutate()}
              disabled={withdrawRelease.isPending}
            >
              Freigabe zurücknehmen
            </Button>
          )}
          <Button
            type="button"
            onClick={async () => {
              if (dirtyKeys.length > 0) await saveAll.mutateAsync();
              releaseWeek.mutate();
            }}
            disabled={releaseLoading || releaseWeek.isPending || saveAll.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            {release ? "Erneut freigeben" : "Woche freigeben"}
          </Button>
        </div>
      </div>

      <section className="surface overflow-x-auto p-0">
        {employees.length === 0 || visibleProjects.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {employees.length === 0
              ? "Bitte zuerst mindestens einen aktiven Mitarbeiter anlegen (Menüpunkt Personal)."
              : "Kein Objekt gefunden – bitte Kunden oder Projekte anlegen bzw. Suche zurücksetzen."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/40 p-3 text-left font-semibold">
                  Mitarbeiter
                </th>
                {visibleProjects.map((p) => (
                  <th key={p.id} className="min-w-[150px] p-3 text-left font-semibold align-top">
                    <div className="truncate">{p.name || "Objekt"}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.city || "—"}</span>
                    </div>
                    {projectAddress(p) && (
                      <a
                        href={mapsUrl(projectAddress(p))}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                      >
                        <Navigation className="h-3 w-3" /> Route
                      </a>
                    )}
                  </th>
                ))}
                <th className="p-3 text-right font-semibold">Summe</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const total = employeeTotal(e.id);
                const soll = Number(e.weekly_hours ?? 0);
                const over = soll > 0 && total > soll;
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="sticky left-0 z-10 bg-background p-3">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.role || "—"}
                        {soll > 0 ? ` · Soll ${soll.toFixed(1)} Std.` : ""}
                      </div>
                    </td>
                    {visibleProjects.map((p) => {
                      const times = cellTimes(e.id, p.id);
                      const days = cellDayHours(e.id, p.id);
                      const sum = cellHours(e.id, p.id);
                      const ranges = times.map((t) => formatDayTime(t)).filter(Boolean);
                      return (
                        <td key={p.id} className="p-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-auto min-h-9 w-full flex-col gap-0.5 py-1 font-medium"
                              >
                                <span>{sum > 0 ? `${sum.toFixed(2)} Std.` : "–"}</span>
                                {ranges.length > 0 && (
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    {ranges[0]}
                                    {ranges.length > 1 ? ` +${ranges.length - 1}` : ""}
                                  </span>
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 space-y-2">
                              <div className="text-sm font-semibold">
                                {e.name} · {p.name || "Objekt"}
                              </div>
                              <WeekQuickFill
                                onApply={(template, dayCount) =>
                                  applyWeekTimes(e.id, p.id, template, dayCount)
                                }
                                onClear={() => clearWeekTimes(e.id, p.id)}
                              />

                              <div className="grid grid-cols-[1.5rem_1fr_1fr_3.2rem_2.6rem] items-center gap-1 text-[10px] text-muted-foreground">
                                <span />
                                <span>Von</span>
                                <span>Bis</span>
                                <span>Pause</span>
                                <span className="text-right">Std.</span>
                              </div>
                              {DAY_LABELS.map((label, i) => (
                                <div
                                  key={label}
                                  className="grid grid-cols-[1.5rem_1fr_1fr_3.2rem_2.6rem] items-center gap-1"
                                >
                                  <span className="text-xs text-muted-foreground">{label}</span>
                                  <Input
                                    type="time"
                                    value={times[i]?.start ?? ""}
                                    onChange={(ev) =>
                                      setDayTime(e.id, p.id, i, { start: ev.target.value })
                                    }
                                    className="h-8 px-1 text-xs"
                                  />
                                  <Input
                                    type="time"
                                    value={times[i]?.end ?? ""}
                                    onChange={(ev) =>
                                      setDayTime(e.id, p.id, i, { end: ev.target.value })
                                    }
                                    className="h-8 px-1 text-xs"
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    step="5"
                                    placeholder="0"
                                    value={times[i]?.breakMin ? String(times[i]!.breakMin) : ""}
                                    onChange={(ev) =>
                                      setDayTime(e.id, p.id, i, {
                                        breakMin: Number(ev.target.value) || 0,
                                      })
                                    }
                                    className="h-8 px-1 text-center text-xs"
                                  />
                                  <span className="text-right text-xs font-medium">
                                    {(days[i] ?? 0).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                              <div className="pt-1 text-right text-xs font-semibold">
                                Woche: {sum.toFixed(2)} Std.
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      );
                    })}

                    <td
                      className={`p-3 text-right font-semibold ${over ? "text-destructive" : ""}`}
                    >
                      {total.toFixed(1)} Std.
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30">
                <td className="sticky left-0 z-10 bg-muted/30 p-3 font-semibold">Objekt-Summe</td>
                {visibleProjects.map((p) => (
                  <td key={p.id} className="p-3 text-center font-semibold">
                    {projectTotal(p.id).toFixed(1)}
                  </td>
                ))}
                <td className="p-3 text-right font-semibold">{grandTotal.toFixed(1)} Std.</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
