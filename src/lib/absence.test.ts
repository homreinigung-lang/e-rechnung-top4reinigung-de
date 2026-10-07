import { describe, expect, it } from "vitest";
import { absenceRangesFor, isEffective } from "./absence";
const day = (work_date: string, approval_status: string, decision_note = "") => ({
  work_date,
  approval_status,
  decision_note,
  entry_type: "absence",
  absence_reason: "vacation",
});
describe("employee absence request results", () => {
  it("keeps adjacent pending, approved and rejected days separate", () => {
    const ranges = absenceRangesFor([
      day("2026-10-07", "pending"),
      day("2026-10-08", "approved"),
      day("2026-10-09", "rejected"),
    ]);
    expect(ranges.map((r) => r.status)).toEqual(["rejected", "approved", "pending"]);
    expect(ranges.map((r) => r.days)).toEqual([1, 1, 1]);
  });
  it("only counts approved absence as effective", () => {
    expect(
      ["pending", "approved", "rejected"].map((s) => isEffective(day("2026-10-07", s))),
    ).toEqual([false, true, false]);
  });
  it("groups contiguous days with the same decision and keeps the administration note", () => {
    const ranges = absenceRangesFor([
      day("2026-10-08", "rejected", "Bitte andere Woche wählen"),
      day("2026-10-07", "rejected", "Bitte andere Woche wählen"),
    ]);
    expect(ranges).toEqual([
      {
        from: "2026-10-07",
        to: "2026-10-08",
        days: 2,
        status: "rejected",
        reason: "vacation",
        decisionNote: "Bitte andere Woche wählen",
      },
    ]);
  });
  it("separates different notes and ignores work entries", () => {
    expect(
      absenceRangesFor([
        day("2026-10-07", "rejected", "A"),
        day("2026-10-08", "rejected", "B"),
        { ...day("2026-10-09", "approved"), entry_type: "work" },
      ]),
    ).toHaveLength(2);
  });
});
