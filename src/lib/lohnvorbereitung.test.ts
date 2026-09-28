import { describe, expect, it } from "vitest";
import { buildLohnvorbereitung } from "./lohnvorbereitung";

const employee = {
  id: "e1",
  name: "Test Mitarbeiter",
  personnel_number: "001",
  hourly_rate: 15,
  weekly_hours: 40,
};

const wageTypes = [
  { kind: "night", surcharge_percent: 30, active: true, time_from: "22:00", time_to: "05:00" },
  { kind: "sunday", surcharge_percent: 80, active: true },
  { kind: "holiday", surcharge_percent: 80, active: true },
  { kind: "overtime", surcharge_percent: 25, active: true },
];

describe("Lohnvorbereitung financial rules", () => {
  it("ignores unapproved and rejected entries", () => {
    const rows = buildLohnvorbereitung(
      [
        { employee_id: "e1", work_date: "2026-09-01", hours: 4, hourly_rate: 15, approval_status: "approved" },
        { employee_id: "e1", work_date: "2026-09-02", hours: 5, hourly_rate: 15, approval_status: "pending" },
        { employee_id: "e1", work_date: "2026-09-03", hours: 6, hourly_rate: 15, approval_status: "rejected" },
      ],
      [employee],
      wageTypes,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.normalstunden).toBe(4);
    expect(rows[0]?.grundlohn).toBe(60);
  });

  it("calculates Sunday surcharge from actual approved hours", () => {
    const rows = buildLohnvorbereitung(
      [{ employee_id: "e1", work_date: "2026-09-27", hours: 2, hourly_rate: 15, approval_status: "approved" }],
      [employee],
      wageTypes,
    );
    expect(rows[0]?.sonntagstunden).toBe(2);
    expect(rows[0]?.grundlohn).toBe(30);
    expect(rows[0]?.zuschlaege).toBe(24);
    expect(rows[0]?.bruttoVorbereitet).toBe(54);
  });

  it("calculates night hours across midnight and scales them to paid hours", () => {
    const rows = buildLohnvorbereitung(
      [{
        employee_id: "e1",
        work_date: "2026-09-28",
        start_time: "22:00",
        end_time: "02:00",
        hours: 3,
        hourly_rate: 15,
        approval_status: "approved",
      }],
      [employee],
      wageTypes,
    );
    expect(rows[0]?.nachtstunden).toBe(3);
    expect(rows[0]?.zuschlaege).toBe(13.5);
  });

  it("uses the holiday-specific surcharge, including special 200 percent days", () => {
    const rows = buildLohnvorbereitung(
      [{ employee_id: "e1", work_date: "2026-12-25", hours: 3, hourly_rate: 15, approval_status: "approved" }],
      [employee],
      wageTypes,
      [{ holiday_date: "2026-12-25", surcharge_percent: 200 }],
    );
    expect(rows[0]?.feiertagstunden).toBe(3);
    expect(rows[0]?.zuschlaege).toBe(90);
  });

  it("applies burden supplement only to hours above 8 in a day", () => {
    const rows = buildLohnvorbereitung(
      [{ employee_id: "e1", work_date: "2026-09-28", hours: 10, hourly_rate: 15, approval_status: "approved" }],
      [employee],
      wageTypes,
    );
    expect(rows[0]?.ueberstunden).toBe(2);
    expect(rows[0]?.zuschlaege).toBe(7.5);
  });

  it("does not double-count daily and weekly burden excess", () => {
    const entries = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"].map(
      (work_date) => ({ employee_id: "e1", work_date, hours: 9, hourly_rate: 15, approval_status: "approved" }),
    );
    const rows = buildLohnvorbereitung(entries, [employee], wageTypes);
    expect(rows[0]?.ueberstunden).toBe(5);
    expect(rows[0]?.zuschlaege).toBe(18.75);
  });

  it("counts each absence date once", () => {
    const rows = buildLohnvorbereitung(
      [
        { employee_id: "e1", work_date: "2026-09-07", entry_type: "vacation", absence_reason: "Urlaub", approval_status: "approved" },
        { employee_id: "e1", work_date: "2026-09-07", entry_type: "vacation", absence_reason: "Urlaub", approval_status: "approved" },
        { employee_id: "e1", work_date: "2026-09-08", entry_type: "sick", absence_reason: "Krank", approval_status: "approved" },
      ],
      [employee],
      wageTypes,
    );
    expect(rows[0]?.urlaubstage).toBe(1);
    expect(rows[0]?.kranktage).toBe(1);
  });
});
