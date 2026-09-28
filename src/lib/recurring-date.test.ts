import { describe, expect, it } from "vitest";
import { nextRecurringDate, recurringAnchorDay } from "./recurring-date";

describe("recurring invoice anchor date", () => {
  it("restores day 31 after a short February", () => {
    expect(nextRecurringDate("2027-01-31", 1, 31)).toBe("2027-02-28");
    expect(nextRecurringDate("2027-02-28", 1, 31)).toBe("2027-03-31");
    expect(nextRecurringDate("2027-03-31", 1, 31)).toBe("2027-04-30");
    expect(nextRecurringDate("2027-04-30", 1, 31)).toBe("2027-05-31");
  });

  it("handles leap years without losing the anchor", () => {
    expect(nextRecurringDate("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(nextRecurringDate("2028-02-29", 1, 31)).toBe("2028-03-31");
  });

  it("preserves an original day 30 across February", () => {
    expect(nextRecurringDate("2027-01-30", 1, 30)).toBe("2027-02-28");
    expect(nextRecurringDate("2027-02-28", 1, 30)).toBe("2027-03-30");
  });

  it("works for quarterly and annual intervals", () => {
    expect(nextRecurringDate("2026-11-30", 3, 30)).toBe("2027-02-28");
    expect(nextRecurringDate("2027-02-28", 3, 30)).toBe("2027-05-30");
    expect(nextRecurringDate("2028-02-29", 12, 29)).toBe("2029-02-28");
  });

  it("derives the anchor day from the original first run date", () => {
    expect(recurringAnchorDay("2026-01-31")).toBe(31);
    expect(recurringAnchorDay("2026-02-28")).toBe(28);
  });
});
