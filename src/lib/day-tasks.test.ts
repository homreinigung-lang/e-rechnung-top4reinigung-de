import { describe, expect, it } from "vitest";
import { buildDayTasks } from "./day-tasks";
const assignment = {
  id: "a1",
  project_id: "p1",
  hours_per_week: 4,
  day_hours: [4, 0, 0, 0, 0, 0, 0],
  day_times: [{ start: "08:00", end: "12:00", breakMin: 0 }],
  start_date: "2026-10-12",
  note: "Schlüssel im Büro",
};
const projects = [{ id: "p1", name: "Büro" }];
describe("Heute und Einsatzkalender", () => {
  it("erhält Planung und Hinweise", () => {
    expect(buildDayTasks([assignment], projects, []).get("2026-10-12")?.[0]).toMatchObject({
      start: "08:00",
      note: "Schlüssel im Büro",
      done: false,
    });
  });
  it("berücksichtigt gespeicherte Zeiten und ignoriert abgelehnte Zeiten", () => {
    const entry = {
      id: "e1",
      work_date: "2026-10-12",
      project_id: "p1",
      start_time: "08:05",
      end_time: "12:10",
    };
    expect(buildDayTasks([assignment], projects, [entry]).get("2026-10-12")?.[0]?.done).toBe(true);
    expect(
      buildDayTasks([assignment], projects, [{ ...entry, approval_status: "rejected" }]).get(
        "2026-10-12",
      )?.[0]?.done,
    ).toBe(false);
  });
});
