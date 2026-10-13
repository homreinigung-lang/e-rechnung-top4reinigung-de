import { localDay } from "./employee-task";
import { clockTime, toMinutes } from "./time-entry";

export type ArbeitsTimer = {
  date: string;
  start: string;
  projectId: string | null;
  breakMin: number;
  planned: boolean;
  end?: string;
  endDate?: string;
};

export function stopTimer(timer: ArbeitsTimer, at: Date): ArbeitsTimer {
  return { ...timer, end: clockTime(at), endDate: localDay(at) };
}

export function parseTimer(raw: string | null): ArbeitsTimer | null {
  try {
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
      typeof t.start !== "string" ||
      toMinutes(t.start) === null
    )
      return null;
    if (
      t.end !== undefined &&
      (typeof t.end !== "string" ||
        toMinutes(t.end) === null ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.endDate))
    )
      return null;
    return {
      date: t.date,
      start: t.start,
      projectId: typeof t.projectId === "string" ? t.projectId : null,
      breakMin: Number.isFinite(t.breakMin) ? Math.max(0, t.breakMin) : 0,
      planned: t.planned === true,
      ...(t.end ? { end: t.end, endDate: t.endDate } : {}),
    };
  } catch {
    return null;
  }
}
