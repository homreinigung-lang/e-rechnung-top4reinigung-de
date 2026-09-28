import { describe, expect, it } from "vitest";
import { isApprovedWorkEntry, percentChange, plannedHoursForMonth, previousMonthKey, revenueForMonth, summarizeObjectFinancials } from "@/lib/object-controlling";

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


describe("object controlling financial summary", () => {
  it("combines wage and other costs into contribution and margin", () => {
    const summary = summarizeObjectFinancials({
      revenue: 1000,
      wageCosts: 420,
      otherCosts: 80,
      hours: 25,
    });

    expect(summary.costs).toBe(500);
    expect(summary.contribution).toBe(500);
    expect(summary.margin).toBe(50);
    expect(summary.contributionPerHour).toBe(20);
  });

  it("shows a negative contribution and margin when costs exceed revenue", () => {
    const summary = summarizeObjectFinancials({
      revenue: 600,
      wageCosts: 500,
      otherCosts: 200,
      hours: 20,
    });

    expect(summary.costs).toBe(700);
    expect(summary.contribution).toBe(-100);
    expect(summary.margin).toBeCloseTo(-16.6667, 4);
    expect(summary.contributionPerHour).toBe(-5);
  });

  it("returns no margin when there is no revenue basis", () => {
    const summary = summarizeObjectFinancials({
      revenue: 0,
      wageCosts: 120,
      otherCosts: 30,
      hours: 10,
    });

    expect(summary.costs).toBe(150);
    expect(summary.contribution).toBe(-150);
    expect(summary.margin).toBeNull();
    expect(summary.contributionPerHour).toBe(-15);
  });

  it("returns no per-hour contribution when there are no worked hours", () => {
    const summary = summarizeObjectFinancials({
      revenue: 350,
      wageCosts: 0,
      otherCosts: 20,
      hours: 0,
    });

    expect(summary.contribution).toBe(330);
    expect(summary.margin).toBeCloseTo(94.2857, 4);
    expect(summary.contributionPerHour).toBeNull();
  });

  it("rounds monetary inputs and totals to cents before deriving ratios", () => {
    const summary = summarizeObjectFinancials({
      revenue: 100.005,
      wageCosts: 33.335,
      otherCosts: 16.335,
      hours: 2,
    });

    expect(summary.revenue).toBe(100.01);
    expect(summary.wageCosts).toBe(33.34);
    expect(summary.otherCosts).toBe(16.34);
    expect(summary.costs).toBe(49.68);
    expect(summary.contribution).toBe(50.33);
    expect(summary.contributionPerHour).toBe(25.165);
  });
});


describe("object controlling month comparison", () => {
  it("finds the previous month across a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-09")).toBe("2026-08");
  });

  it("calculates positive and negative percentage changes", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(80, 100)).toBe(-20);
  });

  it("avoids misleading percentage changes when previous value is zero", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});


describe("object controlling time-entry approval", () => {
  it("counts approved work entries", () => {
    expect(isApprovedWorkEntry({ entry_type: "work", approval_status: "approved" })).toBe(true);
  });

  it("keeps legacy work entries approved by default", () => {
    expect(isApprovedWorkEntry({ entry_type: "work", approval_status: null })).toBe(true);
  });

  it("excludes pending and rejected work entries", () => {
    expect(isApprovedWorkEntry({ entry_type: "work", approval_status: "pending" })).toBe(false);
    expect(isApprovedWorkEntry({ entry_type: "work", approval_status: "rejected" })).toBe(false);
  });

  it("excludes absence entries from worked-hours controlling", () => {
    expect(isApprovedWorkEntry({ entry_type: "vacation", approval_status: "approved" })).toBe(false);
    expect(isApprovedWorkEntry({ entry_type: "sick", approval_status: "approved" })).toBe(false);
  });
});
