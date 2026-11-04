import { describe, expect, it } from "vitest";
import { monthlyDistance, tripsForMonth } from "./fahrtenbuch-month";

describe("monthly mileage", () => {
  it("waits for the month-end reading, including a zero start reading", () => {
    expect(monthlyDistance("1000", "")).toBeNull();
    expect(monthlyDistance("0", "")).toBeNull();
    expect(monthlyDistance("", "1500")).toBeNull();
  });
  it("calculates total mileage with decimal precision", () => {
    const total = monthlyDistance("1000.1", "1500.4");
    expect(total).toBe(500.3);
    expect(monthlyDistance("0", "0")).toBe(0);
  });
  it("rejects invalid and decreasing readings", () => {
    for (const [start, end] of [["1000", "999"], ["-1", "10"], ["NaN", "20"], ["0", "Infinity"]]) {
      expect(monthlyDistance(start!, end!)).toBeNull();
    }
  });
});

describe("monthly PDF selection", () => {
  const entries = ["2025-11-03", "2026-10-31", "2026-11-01", "2026-11-30", "2026-12-01"].map(trip_date => ({ trip_date }));
  it("includes only the selected month and year, including both boundaries", () => {
    expect(tripsForMonth(entries, "2026-11").map(entry => entry.trip_date)).toEqual(["2026-11-01", "2026-11-30"]);
    expect(entries).toHaveLength(5);
  });
  it("returns no trips for empty, invalid and empty months", () => {
    for (const month of ["", "2026-13", "2026-1", "2026-02"]) expect(tripsForMonth(entries, month)).toEqual([]);
  });
});
