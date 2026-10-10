import * as React from "react";

import { DAY_LABELS, EMPTY_DAY_TIME, type DayTime } from "@/lib/planung";

import { firstError } from "@/components/LoadError";
import { type Employee, type GridObject, isoDay, addDays } from "./shared";

import type { usePlanningData } from "./usePlanningData";
import type { usePlanningEdits } from "./usePlanningEdits";

export function usePlanningCoverage(input: {
  absences: ReturnType<typeof usePlanningData>["absences"];
  absencesError: ReturnType<typeof usePlanningData>["absencesError"];
  assignmentsError: ReturnType<typeof usePlanningData>["assignmentsError"];
  cellDayHours: ReturnType<typeof usePlanningData>["cellDayHours"];
  cellErrors: ReturnType<typeof usePlanningData>["cellErrors"];
  cellTimes: ReturnType<typeof usePlanningData>["cellTimes"];
  customersError: ReturnType<typeof usePlanningData>["customersError"];
  draft: ReturnType<typeof usePlanningData>["draft"];
  employeeTotal: ReturnType<typeof usePlanningEdits>["employeeTotal"];
  employees: ReturnType<typeof usePlanningData>["employees"];
  employeesError: ReturnType<typeof usePlanningData>["employeesError"];
  key: ReturnType<typeof usePlanningData>["key"];
  map: ReturnType<typeof usePlanningData>["map"];
  monday: ReturnType<typeof usePlanningData>["monday"];
  objects: ReturnType<typeof usePlanningData>["objects"];
  projectsError: ReturnType<typeof usePlanningData>["projectsError"];
  savedTimes: ReturnType<typeof usePlanningData>["savedTimes"];
  setDraft: ReturnType<typeof usePlanningData>["setDraft"];
  weekStart: ReturnType<typeof usePlanningData>["weekStart"];
}) {
  const {
    absences,
    absencesError,
    assignmentsError,
    cellDayHours,
    cellErrors,
    cellTimes,
    customersError,
    draft,
    employeeTotal,
    employees,
    employeesError,
    key,
    map,
    monday,
    objects,
    projectsError,
    savedTimes,
    setDraft,
    weekStart,
  } = input;
  const grandTotal = employees.reduce((s, e) => s + employeeTotal(e.id), 0);

  const approvedAbsence = (employeeId: string, dayIndex: number) => {
    const date = isoDay(addDays(monday, dayIndex));
    return absences.find((a) => a.employee_id === employeeId && a.work_date === date) ?? null;
  };

  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const timesOverlap = (a: DayTime | undefined, b: DayTime | undefined) => {
    if (!a?.start || !a?.end || !b?.start || !b?.end) return false;
    const aStart = toMinutes(a.start);
    let aEnd = toMinutes(a.end);
    const bStart = toMinutes(b.start);
    let bEnd = toMinutes(b.end);
    if (aEnd <= aStart) aEnd += 1440;
    if (bEnd <= bStart) bEnd += 1440;
    return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
  };

  const absenceAssignments = React.useMemo(() => {
    const rows: {
      employee: Employee;
      object: GridObject;
      dayIndex: number;
      time: DayTime;
      hours: number;
      absenceReason: string;
    }[] = [];
    for (const employee of employees) {
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const absence = approvedAbsence(employee.id, dayIndex);
        if (!absence) continue;
        for (const object of objects) {
          const time = cellTimes(employee.id, object.id)[dayIndex] ?? EMPTY_DAY_TIME;
          const hours = cellDayHours(employee.id, object.id)[dayIndex] ?? 0;
          if (hours <= 0) continue;
          rows.push({
            employee,
            object,
            dayIndex,
            time,
            hours,
            absenceReason:
              absence.absence_reason === "vacation"
                ? "Urlaub"
                : absence.absence_reason === "sick"
                  ? "Krankheit"
                  : "Abwesenheit",
          });
        }
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, objects, absences, draft, map, weekStart]);

  const replacementCandidates = (
    absentEmployeeId: string,
    dayIndex: number,
    targetTime: DayTime,
    targetHours: number,
  ) =>
    employees
      .filter((candidate) => candidate.id !== absentEmployeeId)
      .filter((candidate) => !approvedAbsence(candidate.id, dayIndex))
      .map((candidate) => {
        const candidateTimes = objects
          .map((object) => cellTimes(candidate.id, object.id)[dayIndex])
          .filter((time) => time?.start && time?.end);
        const overlap =
          targetTime.start && targetTime.end
            ? candidateTimes.some((time) => timesOverlap(time, targetTime))
            : false;
        const planned = employeeTotal(candidate.id);
        const target = Number(candidate.weekly_hours ?? 0);
        const remaining = target > 0 ? target - planned : Number.POSITIVE_INFINITY;
        return {
          candidate,
          overlap,
          planned,
          remaining,
          enoughCapacity: !Number.isFinite(remaining) || remaining + 0.01 >= targetHours,
          springer: candidate.role?.toLowerCase() === "springer",
        };
      })
      .filter((item) => !item.overlap)
      .sort((a, b) => {
        if (a.springer !== b.springer) return a.springer ? -1 : 1;
        if (a.enoughCapacity !== b.enoughCapacity) return a.enoughCapacity ? -1 : 1;
        return b.remaining - a.remaining;
      });

  const applyReplacement = (
    absentEmployeeId: string,
    replacementEmployeeId: string,
    projectId: string,
    dayIndex: number,
    time: DayTime,
  ) => {
    setDraft((current) => {
      const next = { ...current };
      const absentKey = key(absentEmployeeId, projectId);
      const replacementKey = key(replacementEmployeeId, projectId);
      const absentTimes = [...(next[absentKey] ?? savedTimes(absentEmployeeId, projectId))];
      const replacementTimes = [
        ...(next[replacementKey] ?? savedTimes(replacementEmployeeId, projectId)),
      ];
      absentTimes[dayIndex] = { ...EMPTY_DAY_TIME };
      replacementTimes[dayIndex] = { ...time };
      next[absentKey] = absentTimes;
      next[replacementKey] = replacementTimes;
      return next;
    });
  };

  const planningConflicts = React.useMemo(() => {
    const conflicts: { employeeId: string; dayIndex: number; message: string }[] = [];
    for (const employee of employees) {
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const scheduled = objects
          .map((object) => ({
            object,
            time: cellTimes(employee.id, object.id)[dayIndex],
            hours: cellDayHours(employee.id, object.id)[dayIndex] ?? 0,
          }))
          .filter((item) => item.hours > 0);

        const absence = approvedAbsence(employee.id, dayIndex);
        if (absence && scheduled.length > 0) {
          conflicts.push({
            employeeId: employee.id,
            dayIndex,
            message: `${DAY_LABELS[dayIndex]}: Abwesenheit und Einsatz gleichzeitig geplant.`,
          });
        }

        const withTimes = scheduled.filter((item) => item.time?.start && item.time?.end);
        for (let i = 0; i < withTimes.length; i += 1) {
          for (let j = i + 1; j < withTimes.length; j += 1) {
            const a = withTimes[i]!;
            const b = withTimes[j]!;
            const aStart = toMinutes(a.time!.start);
            let aEnd = toMinutes(a.time!.end);
            const bStart = toMinutes(b.time!.start);
            let bEnd = toMinutes(b.time!.end);
            if (aEnd <= aStart) aEnd += 1440;
            if (bEnd <= bStart) bEnd += 1440;
            if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
              conflicts.push({
                employeeId: employee.id,
                dayIndex,
                message: `${DAY_LABELS[dayIndex]}: Zeitüberschneidung zwischen ${a.object.name || "Objekt"} und ${b.object.name || "Objekt"}.`,
              });
            }
          }
        }
      }
    }
    return conflicts;
    // cellTimes/cellDayHours intentionally depend on draft/map through this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, objects, absences, draft, map, weekStart]);

  const overtimeWarnings = employees
    .map((employee) => {
      const planned = employeeTotal(employee.id);
      const target = Number(employee.weekly_hours ?? 0);
      return { employee, planned, target, over: target > 0 ? planned - target : 0 };
    })
    .filter((item) => item.over > 0.01);

  const loadError = firstError(
    employeesError,
    projectsError,
    customersError,
    assignmentsError,
    absencesError,
  );
  const cellErrorList = Object.entries(cellErrors);
  return {
    absenceAssignments,
    applyReplacement,
    cellErrorList,
    grandTotal,
    loadError,
    overtimeWarnings,
    planningConflicts,
    replacementCandidates,
  };
}
