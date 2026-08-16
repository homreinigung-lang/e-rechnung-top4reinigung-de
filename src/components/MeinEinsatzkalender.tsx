import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { DAY_LABELS, effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { projectAddress } from "@/lib/maps";

export type KalenderAssignment = {
  id: string;
  project_id: string | null;
  hours_per_week: number | null;
  day_hours: unknown;
  day_times?: unknown;
  start_date: string | null;
  assignment_role?: string | null;
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

type DayTask = {
  key: string;
  projectId: string | null;
  name: string;
  address: string;
  hours: number;
  range: string;
  role: string | null;
  released: boolean;
};


/**
 * Einsatzkalender im Mitarbeiterportal: zeigt die in der Arbeitsplanung
 * freigegebenen Tagesstunden je Objekt automatisch als Monatskalender an.
 */
export function MeinEinsatzkalender({
  assignments,
  projects,
  onSelectProject,
}: {
  assignments: KalenderAssignment[];
  projects: KalenderProjekt[];
  onSelectProject?: (projectId: string) => void;
}) {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
  });

  const projectMap = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  /** Tagesdatum -> geplante Einsätze (aus Wochenplanung abgeleitet). */
  const byDay = React.useMemo(() => {
    const m = new Map<string, DayTask[]>();
    for (const a of assignments) {
      if (!a.start_date) continue;
      const monday = mondayOf(new Date(`${a.start_date}T12:00:00`));
      const days = effectiveDayHours(a.day_hours, a.hours_per_week, a.day_times);
      const times = normalizeDayTimes(a.day_times);
      days.forEach((hours, i) => {
        if (!hours || hours <= 0) return;
        const date = isoDay(addDays(monday, i));
        const p = a.project_id ? projectMap.get(a.project_id) : undefined;
        const list = m.get(date) ?? [];
        list.push({
          key: `${a.id}-${i}`,
          projectId: a.project_id,
          name: p?.name || "Objekt",
          address: p ? projectAddress(p) : "",
          hours,
          range: formatDayTime(times[i]),
          role: a.assignment_role ?? null,
          released: a.released !== false,

        });
        m.set(date, list);
      });
    }
    return m;
  }, [assignments, projectMap]);

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
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mein Einsatzkalender</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatisch aus der freigegebenen Arbeitsplanung – Objekt, Adresse und Stunden je Tag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">
            {monthHours.toFixed(2)} Std. geplant
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Vorheriger Monat"
            onClick={() =>
              setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1, 12))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">{monthLabel}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Nächster Monat"
            onClick={() =>
              setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1, 12))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
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
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => t.projectId && onSelectProject?.(t.projectId)}
                    className={`block w-full rounded border px-1.5 py-1 text-left transition ${
                      t.released
                        ? "border-primary/30 bg-primary/10 hover:bg-primary/20"
                        : "border-dashed border-muted-foreground/40 bg-muted hover:bg-muted/70"
                    }`}
                  >
                    <span className="block truncate font-medium">{t.name}</span>
                    {t.address && (
                      <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.address}</span>
                      </span>
                    )}
                    <span
                      className={`block text-[10px] font-semibold ${
                        t.released ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {t.range ? `${t.range} · ` : ""}
                      {t.hours.toFixed(2)} Std.
                      {!t.released && " · vorläufig"}
                    </span>

                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
