import { effectiveDayHours, normalizeDayTimes, formatDayTime } from "@/lib/planung";
import { matchesTask } from "@/lib/employee-task";
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

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Montag der Woche zum übergebenen Datum. */
export function mondayOf(date: Date) {
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

export function buildDayTasks(
  assignments: KalenderAssignment[],
  projects: KalenderProjekt[],
  entries: KalenderZeiteintrag[],
): Map<string, DayTask[]> {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const workByDay = (() => {
    const m = new Map<string, KalenderZeiteintrag[]>();
    for (const e of entries) {
      if ((e.entry_type ?? "work") !== "work") continue;
      const d = String(e.work_date).slice(0, 10);
      const list = m.get(d) ?? [];
      list.push(e);
      m.set(d, list);
    }
    return m;
  })();
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
}
