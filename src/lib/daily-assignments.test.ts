import { describe, expect, it } from "vitest";
import {
  dailyVisits,
  weekStartForDay,
  type DailyAssignment,
  type DailyTimeEntry,
} from "./daily-assignments";

const day = "2026-10-07";
const assignment: DailyAssignment = {
  id: "plan",
  user_id: "owner",
  employee_id: "worker",
  project_id: "site",
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  hours_per_week: 3,
  day_hours: [0, 0, 3, 0, 0, 0, 0],
  day_times: [{}, {}, { start: "08:00", end: "11:00", breakMin: 0 }],
};
const entry: DailyTimeEntry = {
  id: "time",
  employee_id: "worker",
  employee_name: "Anna",
  project_id: "site",
  customer_id: "customer",
  work_date: day,
  start_time: "08:15",
  end_time: "10:45",
  hours: 2.5,
  location: "",
  entry_type: "work",
  approval_status: "approved",
  completed_at: "2026-10-07T10:45:00Z",
};
const input = {
  day,
  assignments: [assignment],
  entries: [] as DailyTimeEntry[],
  releases: [{ user_id: "owner", week_start: "2026-10-05" }],
  employees: [{ id: "worker", name: "Anna" }],
  projects: [
    {
      id: "site",
      name: "Büro",
      customer_id: "customer",
      address_line: "Musterstraße 1",
      postal_code: "66333",
      city: "Völklingen",
    },
  ],
};

describe("daily published work", () => {
  it("shows a released shift before any time is recorded", () => {
    expect(dailyVisits(input)).toMatchObject([
      {
        project_name: "Büro",
        employee_name: "Anna",
        plannedHours: 3,
        actualHours: 0,
        status: "planned",
        location: "Musterstraße 1, 66333 Völklingen",
      },
    ]);
  });
  it("does not show unpublished plans or use another company's release", () => {
    expect(dailyVisits({ ...input, releases: [] })).toEqual([]);
    expect(
      dailyVisits({ ...input, releases: [{ user_id: "other", week_start: "2026-10-05" }] }),
    ).toEqual([]);
  });
  it("combines actual time with its shift exactly once and separates plan and actual hours", () => {
    expect(dailyVisits({ ...input, entries: [entry] })).toMatchObject([
      { plannedHours: 3, actualHours: 2.5, status: "done" },
    ]);
    expect(dailyVisits({ ...input, entries: [entry] })).toHaveLength(1);
  });
  it("keeps unplanned work visible without adding planned hours", () => {
    expect(dailyVisits({ ...input, assignments: [], entries: [entry] })).toMatchObject([
      { plannedHours: 0, actualHours: 2.5 },
    ]);
  });
  it("does not count absences or rejected work as actual hours", () => {
    const visits = dailyVisits({
      ...input,
      entries: [
        { ...entry, entry_type: "absence" },
        { ...entry, id: "rejected", approval_status: "rejected" },
      ],
    });
    expect(visits).toMatchObject([{ plannedHours: 3, actualHours: 0, status: "planned" }]);
  });
  it("does not assign another employee's or object's hours to a planned visit", () => {
    const visits = dailyVisits({
      ...input,
      entries: [
        { ...entry, employee_id: "other" },
        { ...entry, id: "other-site", project_id: "other-site" },
      ],
    });
    expect(visits.find((v) => v.id === "plan:plan")?.actualHours).toBe(0);
    expect(visits).toHaveLength(3);
  });
  it("does not duplicate a legacy plan replaced by a weekly plan", () => {
    expect(
      dailyVisits({
        ...input,
        assignments: [
          assignment,
          { ...assignment, id: "legacy", start_date: null, end_date: null },
        ],
      }),
    ).toHaveLength(1);
  });
  it("ignores dates and weekdays outside the assignment", () => {
    expect(dailyVisits({ ...input, day: "2026-10-06" })).toEqual([]);
    expect(
      dailyVisits({
        ...input,
        day: "2026-10-14",
        releases: [{ user_id: "owner", week_start: "2026-10-12" }],
      }),
    ).toEqual([]);
  });
  it("keeps a second shift separate from the first at the same object", () => {
    const second = {
      ...assignment,
      id: "late",
      day_times: [{}, {}, { start: "12:00", end: "15:00", breakMin: 0 }],
    };
    const visits = dailyVisits({ ...input, assignments: [assignment, second], entries: [entry] });
    expect(visits.map((v) => v.actualHours)).toEqual([2.5, 0]);
  });
  it("combines an overnight shift with its actual hours without duplicate visits", () => {
    const night = {
      ...assignment,
      day_times: [{}, {}, { start: "22:00", end: "02:00", breakMin: 0 }],
    };
    const actual = { ...entry, start_time: "22:15", end_time: "01:45", hours: 3.5 };
    expect(dailyVisits({ ...input, assignments: [night], entries: [actual] })).toMatchObject([
      { plannedHours: 4, actualHours: 3.5, status: "done" },
    ]);
    expect(dailyVisits({ ...input, assignments: [night], entries: [actual] })).toHaveLength(1);
  });
  it("computes Monday boundaries without daylight-saving or year-boundary drift", () => {
    expect(weekStartForDay("2026-10-25")).toBe("2026-10-19");
    expect(weekStartForDay("2027-01-01")).toBe("2026-12-28");
  });
});
