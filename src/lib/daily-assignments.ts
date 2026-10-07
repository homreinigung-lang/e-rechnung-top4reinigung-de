import { effectiveDayHours, normalizeDayTimes } from "./planung";
import { matchesTask } from "./employee-task";
import { einsatzStatus, type EinsatzStatus } from "./einsatz-status";

export type DailyAssignment = {
  id: string;
  user_id: string;
  employee_id: string;
  project_id: string;
  start_date: string | null;
  end_date: string | null;
  day_hours: unknown;
  day_times: unknown;
  hours_per_week: number;
};
export type DailyTimeEntry = {
  id: string;
  employee_id: string | null;
  project_id: string | null;
  customer_id: string | null;
  employee_name: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  location: string;
  entry_type: string;
  approval_status: string;
  completed_at: string | null;
};
type Project = {
  id: string;
  name: string;
  customer_id: string | null;
  address_line: string;
  postal_code: string;
  city: string;
};
export type DailyVisit = {
  id: string;
  project_id: string | null;
  project_name: string;
  customer_id: string | null;
  employee_name: string;
  location: string;
  start_time: string | null;
  end_time: string | null;
  plannedHours: number;
  actualHours: number;
  status: EinsatzStatus;
};

export function weekStartForDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Published plans and their actual work, without duplicate legacy plans or absences. */
export function dailyVisits(input: {
  day: string;
  assignments: DailyAssignment[];
  entries: DailyTimeEntry[];
  releases: { user_id: string; week_start: string }[];
  employees: { id: string; name: string }[];
  projects: Project[];
}): DailyVisit[] {
  const { day } = input;
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const released = new Set(input.releases.map((r) => `${r.user_id}:${r.week_start}`));
  const inRange = input.assignments.filter(
    (a) => (!a.start_date || a.start_date <= day) && (!a.end_date || a.end_date >= day),
  );
  const modern = new Set(
    inRange.filter((a) => a.start_date).map((a) => `${a.employee_id}:${a.project_id}`),
  );
  const plans = inRange.filter(
    (a) =>
      (a.start_date || !modern.has(`${a.employee_id}:${a.project_id}`)) &&
      released.has(`${a.user_id}:${weekStartForDay(day)}`),
  );
  const work = input.entries.filter(
    (e) =>
      e.work_date === day &&
      (e.entry_type ?? "work") === "work" &&
      e.approval_status !== "rejected",
  );
  const used = new Set<string>();
  const visits: DailyVisit[] = [];
  for (const assignment of plans) {
    const hours =
      effectiveDayHours(assignment.day_hours, assignment.hours_per_week, assignment.day_times)[
        weekday
      ] ?? 0;
    if (hours <= 0) continue;
    const time = normalizeDayTimes(assignment.day_times)[weekday]!;
    const actual = work.filter(
      (e) =>
        !used.has(e.id) &&
        e.employee_id === assignment.employee_id &&
        matchesTask(e, {
          date: day,
          projectId: assignment.project_id,
          start: time.start,
          end: time.end,
        }),
    );
    actual.forEach((e) => used.add(e.id));
    const project = input.projects.find((p) => p.id === assignment.project_id);
    const statuses = actual.map(einsatzStatus);
    visits.push({
      id: `plan:${assignment.id}`,
      project_id: assignment.project_id,
      project_name: project?.name ?? "",
      customer_id: project?.customer_id ?? null,
      employee_name: input.employees.find((e) => e.id === assignment.employee_id)?.name ?? "",
      location: [
        project?.address_line,
        [project?.postal_code, project?.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", "),
      start_time: time.start,
      end_time: time.end,
      plannedHours: hours,
      actualHours: actual.reduce((sum, e) => sum + Number(e.hours || 0), 0),
      status: statuses.includes("requested")
        ? "requested"
        : statuses.includes("running")
          ? "running"
          : statuses.length
            ? "done"
            : "planned",
    });
  }
  // Unplanned work remains visible, but does not inflate the planned hours.
  for (const entry of work.filter((e) => !used.has(e.id))) {
    visits.push({
      id: `actual:${entry.id}`,
      project_id: entry.project_id,
      project_name: input.projects.find((p) => p.id === entry.project_id)?.name ?? "",
      customer_id: entry.customer_id,
      employee_name: entry.employee_name,
      location: entry.location,
      start_time: entry.start_time,
      end_time: entry.end_time,
      plannedHours: 0,
      actualHours: Number(entry.hours || 0),
      status: einsatzStatus(entry),
    });
  }
  return visits.sort((a, b) => (a.start_time || "99:99").localeCompare(b.start_time || "99:99"));
}
