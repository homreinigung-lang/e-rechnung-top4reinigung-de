import { describe, it, expect } from "vitest";
import { matchesTask } from "./employee-task";
const task = { date: "2026-10-07", projectId: "a", start: "08:00", end: "10:00" };
const entry = {
  id: "1",
  work_date: task.date,
  project_id: "a",
  start_time: "08:00:00",
  end_time: "10:00:00",
};
describe("planned task completion", () => {
  it("does not complete another object on the same day", () =>
    expect(matchesTask({ ...entry, project_id: "b" }, task)).toBe(false));
  it("allows a second shift at the same object after the first ends", () =>
    expect(matchesTask(entry, { ...task, start: "10:00", end: "12:00" })).toBe(false));
  it("matches actual time when it overlaps the planned window", () =>
    expect(matchesTask({ ...entry, start_time: "08:15" }, task)).toBe(true));
  it("ignores rejected entries and absences", () => {
    expect(matchesTask({ ...entry, approval_status: "rejected" }, task)).toBe(false);
    expect(matchesTask({ ...entry, entry_type: "absence" }, task)).toBe(false);
  });
  it("matches legacy untimed plans only at their own object and date", () => {
    expect(matchesTask(entry, { ...task, start: "", end: "" })).toBe(true);
    expect(matchesTask({ ...entry, work_date: "2026-10-06" }, task)).toBe(false);
  });
});
