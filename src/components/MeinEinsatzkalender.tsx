import * as React from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { DAY_LABELS, effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { matchesTask } from "@/lib/employee-task";
import { formatDate } from "@/lib/format";
import { projectAddress } from "@/lib/maps";

export type KalenderAssignment = {
  id: string;
  project_id: string | null;
  hours_per_week: number | null;
  day_hours: unknown;
  day_times?: unknown;
  start_date: string | null;
  assignment_role?: string | null;
  note?: string | null;
  released?: boolean;
};

export type KalenderProjekt = {
  id: string;
  name: string;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Montag der Woche zum übergebenen Datum. */
function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(12, 0, 0, 0);
  return d;
}

export type DayTask = {
  key: string;
  date: string;
  projectId: string | null;
  assignmentId: string;
  name: string;
  address: string;
  hours: number;
  range: string;
  start: string;
  end: string;
  breakMin: number;
  role: string | null;
  note?: string;
  released: boolean;
  done: boolean;
  actual: string;
};

export type KalenderZeiteintrag = {
  id: string;
  work_date: string;
  project_id: string | null;
  entry_type?: string | null;
  approval_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | string | null;
};

/**
 * Einsatzkalender im Mitarbeiterportal: zeigt die in der Arbeitsplanung
 * freigegebenen Tagesstunden je Objekt automatisch als Monatskalender an.
 */
export function MeinEinsatzkalender({
  assignments,
  projects,
  entries = [],
  onSelectProject,
  onSelectTask,
  onConfirm,
  confirmingKey = null,
}: {
  assignments: KalenderAssignment[];
  projects: KalenderProjekt[];
  entries?: KalenderZeiteintrag[];
  onSelectProject?: (projectId: string) => void;
  onSelectTask?: (task: DayTask) => void;
  /** Einsatz als erledigt bestätigen – überträgt die Planzeit in die Arbeitszeit. */
  onConfirm?: (task: DayTask) => void;
  confirmingKey?: string | null;
}) {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
  });

  const [selectedDate, setSelectedDate] = React.useState(() => isoDay(new Date()));

  function changeMonth(offset: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1, 12);
    setCursor(next);
    setSelectedDate(isoDay(next));
  }

  const projectMap = React.useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  /** Erfasste Arbeitszeiten je Tag – dienen zum Zusammenführen mit der Planung. */
  const workByDay = React.useMemo(() => {
    const m = new Map<string, KalenderZeiteintrag[]>();
    for (const e of entries) {
      if ((e.entry_type ?? "work") !== "work") continue;
      const d = String(e.work_date).slice(0, 10);
      const list = m.get(d) ?? [];
      list.push(e);
      m.set(d, list);
    }
    return m;
  }, [entries]);

  /** Tagesdatum -> geplante Einsätze (aus Wochenplanung abgeleitet, mit Ist-Zeit zusammengeführt). */
  const byDay = React.useMemo(() => {
    const m = new Map<string, DayTask[]>();
    const used = new Set<string>();
    for (const a of assignments) {
      if (!a.start_date) continue;
      const monday = mondayOf(new Date(`${a.start_date}T12:00:00`));
      const days = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
      const times = normalizeDayTimes(a.day_times);
      days.forEach((hours, i) => {
        if (!hours || hours <= 0) return;
        const date = isoDay(addDays(monday, i));
        const p = a.project_id ? projectMap.get(a.project_id) : undefined;
        const candidates = (workByDay.get(date) ?? []).filter((e) => !used.has(e.id));
        const hit = candidates.find((e) =>
          matchesTask(e, {
            date,
            projectId: a.project_id,
            start: times[i]?.start ?? "",
            end: times[i]?.end ?? "",
          }),
        );
        if (hit) used.add(hit.id);
        const list = m.get(date) ?? [];
        list.push({
          key: `${a.id}-${i}`,
          date,
          projectId: a.project_id,
          assignmentId: a.id,
          name: p?.name || "Objekt",
          address: p ? projectAddress(p) : "",
          hours,
          range: formatDayTime(times[i]),
          start: times[i]?.start ?? "",
          end: times[i]?.end ?? "",
          breakMin: times[i]?.breakMin ?? 0,
          role: a.assignment_role ?? null,
          note: a.note ?? "",
          released: a.released !== false,
          done: Boolean(hit),
          actual: hit
            ? `${(hit.start_time ?? "").slice(0, 5)}–${(hit.end_time ?? "").slice(0, 5)}`.replace(
                /^–$/,
                "",
              )
            : "",
        });
        m.set(date, list);
      });
    }
    return m;
  }, [assignments, projectMap, workByDay]);

  const monthLabel = cursor.toLocaleDateString("de-DE-u-ca-gregory-nu-latn", {
    month: "long",
    year: "numeric",
  });

  const cells = React.useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = mondayOf(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i);
      return {
        date: isoDay(d),
        day: d.getDate(),
        inMonth: d.getMonth() === cursor.getMonth(),
      };
    });
  }, [cursor]);

  const monthHours = React.useMemo(() => {
    const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    let sum = 0;
    for (const [date, list] of byDay) {
      if (!date.startsWith(prefix)) continue;
      for (const t of list) sum += t.hours;
    }
    return sum;
  }, [byDay, cursor]);

  const today = isoDay(new Date());

  return (
    <section className="surface min-w-0 p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mein Einsatzkalender</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatisch aus der freigegebenen Arbeitsplanung – Objekt, Adresse und Stunden je Tag.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
          <span className="w-full text-sm text-muted-foreground sm:mr-2 sm:w-auto">
            {monthHours.toFixed(2)} Std. geplant
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Vorheriger Monat"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-0 flex-1 text-center text-sm font-medium sm:min-w-40">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Nächster Monat"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-4 md:hidden">
        <div className="grid grid-cols-7 gap-1" aria-label="Tag auswählen">
          {DAY_LABELS.map((day) => (
            <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          {cells.map((cell) => {
            const count = (byDay.get(cell.date) ?? []).length;
            return (
              <button
                key={cell.date}
                type="button"
                aria-label={`${formatDate(cell.date)}, ${count} Einsätze`}
                aria-pressed={selectedDate === cell.date}
                onClick={() => setSelectedDate(cell.date)}
                className={`flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedDate === cell.date ? "bg-primary text-primary-foreground" : "bg-muted/40"
                } ${cell.inMonth ? "" : "opacity-45"} ${cell.date === today ? "ring-1 ring-inset ring-primary" : ""}`}
              >
                <span>{cell.day}</span>
                <span className="h-3 text-[10px] leading-3">{count ? `${count} ·` : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Aufgaben am {formatDate(selectedDate)}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1, 12));
              setSelectedDate(isoDay(now));
            }}
          >
            Heute
          </Button>
        </div>
        {(byDay.get(selectedDate) ?? []).length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            Für diesen Tag sind keine Einsätze geplant.
          </p>
        ) : (
          <ul className="space-y-3">
            {[...(byDay.get(selectedDate) ?? [])]
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((task) => (
                <li key={task.key} className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="min-w-0 flex-1 whitespace-pre-wrap break-words font-semibold">
                      {task.name}
                    </h4>
                    <span
                      className={`rounded border px-2 py-1 text-xs ${task.done ? "border-sky-600 bg-sky-600 text-white" : "bg-muted"}`}
                    >
                      {task.done ? "Erledigt" : task.released ? "Freigegeben" : "Geplant"}
                    </span>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Einsatzort / Arbeitsadresse</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words">
                        {task.address ||
                          "Keine Einsatzadresse hinterlegt – bitte Verwaltung kontaktieren"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Geplante Arbeitszeit</dt>
                      <dd className="mt-1">
                        {task.range || "Keine Uhrzeit hinterlegt"} · {task.hours.toFixed(2)} Std.
                      </dd>
                      <dd className="mt-1 text-muted-foreground">Pause: {task.breakMin} Min.</dd>
                    </div>
                    {task.role && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Aufgabe / Tätigkeit</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">{task.role}</dd>
                      </div>
                    )}
                    {task.note && (
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Arbeitsanweisungen / Hinweise
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">{task.note}</dd>
                      </div>
                    )}
                    {task.done && task.actual && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Erfasste Arbeitszeit</dt>
                        <dd className="mt-1">{task.actual}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal"
                      onClick={() =>
                        onSelectTask
                          ? onSelectTask(task)
                          : task.projectId && onSelectProject?.(task.projectId)
                      }
                    >
                      Alle Einsatzdetails öffnen
                    </Button>
                    {!task.done && onConfirm && task.date <= today && (
                      <Button
                        className="h-auto min-h-11 whitespace-normal"
                        disabled={confirmingKey === task.key || !task.start || !task.end}
                        onClick={() => onConfirm(task)}
                      >
                        {confirmingKey === task.key
                          ? "Wird übernommen …"
                          : "Planzeit als Arbeitszeit übernehmen"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="mt-4 hidden grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs md:grid">
        {DAY_LABELS.map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 text-center font-medium">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const tasks = byDay.get(cell.date) ?? [];
          return (
            <div
              key={cell.date}
              className={`min-h-24 bg-card p-1.5 align-top ${cell.inMonth ? "" : "opacity-45"} ${
                cell.date === today ? "ring-1 ring-inset ring-primary" : ""
              }`}
            >
              <div className="mb-1 text-right text-[11px] text-muted-foreground">{cell.day}</div>
              <div className="space-y-1">
                {tasks.map((t) => (
                  <div
                    key={t.key}
                    className={`rounded border transition ${
                      t.done
                        ? "border-sky-600 bg-sky-600 text-white"
                        : t.released
                          ? "border-primary/30 bg-primary/10"
                          : "border-dashed border-muted-foreground/40 bg-muted"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onSelectTask
                          ? onSelectTask(t)
                          : t.projectId && onSelectProject?.(t.projectId)
                      }
                      className="block w-full px-1.5 py-1 text-left"
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {t.done && <Check className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{t.name}</span>
                      </span>
                      {t.address && (
                        <span
                          className={`flex items-start gap-1 text-[10px] font-medium ${t.done ? "text-white/90" : "text-foreground"}`}
                        >
                          <MapPin className="mt-px h-3 w-3 shrink-0" />
                          <span className="min-w-0">
                            <span
                              className={`block text-[9px] font-semibold uppercase tracking-wide ${t.done ? "text-white/70" : "text-muted-foreground"}`}
                            >
                              Einsatzort
                            </span>
                            <span className="block truncate" title={t.address}>
                              {t.address}
                            </span>
                          </span>
                        </span>
                      )}

                      <span
                        className={`block text-[10px] font-semibold ${
                          t.done
                            ? "text-white"
                            : t.released
                              ? "text-primary"
                              : "text-muted-foreground"
                        }`}
                      >
                        {(t.done && t.actual ? t.actual : t.range)
                          ? `${t.done && t.actual ? t.actual : t.range} · `
                          : ""}
                        {t.hours.toFixed(2)} Std.
                        {t.done ? " · Erledigt" : !t.released ? " · geplant" : ""}
                      </span>
                    </button>
                    {!t.done && onConfirm && cell.date <= today && (
                      <button
                        type="button"
                        disabled={confirmingKey === t.key}
                        onClick={() => onConfirm(t)}
                        className="flex w-full items-center justify-center gap-1 rounded-b border-t border-primary/20 px-1 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        {confirmingKey === t.key ? "…" : "Planzeit übernehmen"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
