import { absenceReason, type AbsenceReason, type EntryType } from "@/lib/absence";

export type PlanShift = {
  key: string;
  employeeId: string;
  employeeName: string;
  projectId: string | null;
  projectName: string;
  range: string;
  hours: number;
  start: string;
  end: string;
  breakMin: number;
  date: string;
};

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export const NO_PROJECT = "__none__";

export const ALL = "__all__";

export type TimeEntry = import("@/integrations/supabase/types").Tables<"time_entries">;

export type KalenderEmployee = {
  id: string;
  name: string;
  hourly_rate: number | null;
  weekly_hours?: number | null;
};

export type KalenderProject = { id: string; name: string | null; city?: string | null };

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

export function parseHm(value: string): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let h: number, m: number;
  const colon = /^(\d{1,2})[:.](\d{1,2})$/.exec(raw);
  const plain = /^(\d{3,4})$/.exec(raw);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (plain) {
    const s = plain[1]!.padStart(4, "0");
    h = Number(s.slice(0, 2));
    m = Number(s.slice(2));
  } else return null;
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function minutesToHm(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hoursFromTimes(start: string, end: string, breakMinutes: number) {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null) return 0;
  const pause = Number.isFinite(breakMinutes) ? Math.max(0, breakMinutes) : 0;
  let mins = e - s;
  if (mins < 0) mins += 24 * 60;
  mins -= pause;
  const hours = Math.round((mins / 60) * 100) / 100;
  return Number.isFinite(hours) ? Math.max(0, hours) : 0;
}

export const SERVICE_CATEGORIES = [
  {
    value: "unterhaltsreinigung",
    label: "Unterhaltsreinigung",
    classes:
      "border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-400 dark:bg-blue-950/70 dark:text-blue-100",
    dot: "bg-blue-500",
  },
  {
    value: "glasreinigung",
    label: "Glasreinigung",
    classes:
      "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    value: "bauendreinigung",
    label: "Bauend-/Grundreinigung",
    classes:
      "border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-950/70 dark:text-purple-100",
    dot: "bg-purple-500",
  },
  {
    value: "sonstiges",
    label: "Sonstiges",
    classes:
      "border-slate-400 bg-slate-100 text-slate-900 dark:border-slate-500 dark:bg-slate-800/70 dark:text-slate-100",
    dot: "bg-slate-400",
  },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];

export const serviceCategoryOf = (e: { service_category?: string | null }): ServiceCategory =>
  (SERVICE_CATEGORIES.find((c) => c.value === (e.service_category ?? "sonstiges"))?.value ??
    "sonstiges") as ServiceCategory;

export const serviceClasses = (e: { service_category?: string | null }) =>
  SERVICE_CATEGORIES.find((c) => c.value === serviceCategoryOf(e))!.classes;

export type PlanForm = {
  employeeIds: string[];
  entryType: EntryType;
  absenceReason: AbsenceReason;
  serviceCategory: ServiceCategory;
  projectId: string;
  customerId: string;
  location: string;
  start: string;
  end: string;
  breakMinutes: string;
  note: string;
};

export const emptyForm: PlanForm = {
  employeeIds: [],
  entryType: "work",
  absenceReason: "vacation",
  serviceCategory: "sonstiges",
  projectId: NO_PROJECT,
  customerId: NO_PROJECT,
  location: "",

  start: "08:00",
  end: "16:00",
  breakMinutes: "30",
  note: "",
};
