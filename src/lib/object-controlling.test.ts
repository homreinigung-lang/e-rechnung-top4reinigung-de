import { describe, expect, it } from "vitest";
import { plannedHoursForMonth, revenueForMonth } from "@/lib/object-controlling";

describe("object controlling accuracy", () => {
  it("uses service period month before invoice issue month", () => {
    const document = {
      issue_date: "2026-09-03",
      service_period: "01.08.2026 – 31.08.2026",
      net_total: 2748.25,
    };
    expect(revenueForMonth(document, "2026-08")).toBeCloseTo(2748.25, 2);
    expect(revenueForMonth(document, "2026-09")).toBe(0);
  });

  it("falls back to invoice issue month when no service period exists", () => {
    const document = {
      issue_date: "2026-09-03",
      service_period: "",
      net_total: 350,
    };
    expect(revenueForMonth(document, "2026-09")).toBe(350);
    expect(revenueForMonth(document, "2026-08")).toBe(0);
  });

  it("allocates a cross-month service period by calendar days", () => {
    const document = {
      issue_date: "2026-09-30",
      service_period: "16.09.2026 – 15.10.2026",
      net_total: 3000,
    };
    expect(revenueForMonth(document, "2026-09")).toBeCloseTo(1500, 2);
    expect(revenueForMonth(document, "2026-10")).toBeCloseTo(1500, 2);
  });

  it("counts only planned days that actually lie in the month", () => {
    const assignments = [
      {
        start_date: "2026-08-31",
        end_date: "2026-09-06",
        hours_per_week: 10,
        day_hours: [2, 2, 2, 2, 2, 0, 0],
      },
    ];
    expect(plannedHoursForMonth(assignments, "2026-08")).toBe(2);
    expect(plannedHoursForMonth(assignments, "2026-09")).toBe(8);
  });

  it("uses exact calendar weekdays for recurring legacy plans instead of 4.33", () => {
    const assignments = [
      {
        start_date: null,
        end_date: null,
        hours_per_week: 10,
        day_hours: [2, 2, 2, 2, 2, 0, 0],
      },
    ];
    // September 2026 has 22 weekdays.
    expect(plannedHoursForMonth(assignments, "2026-09")).toBe(44);
  });

  it("prefers dated weekly plans over undated legacy rows to avoid double counting", () => {
    const assignments = [
      {
        start_date: null,
        end_date: null,
        hours_per_week: 40,
        day_hours: [8, 8, 8, 8, 8, 0, 0],
      },
      {
        start_date: "2026-09-07",
        end_date: "2026-09-13",
        hours_per_week: 10,
        day_hours: [2, 2, 2, 2, 2, 0, 0],
      },
    ];
    expect(plannedHoursForMonth(assignments, "2026-09")).toBe(10);
  });
});
