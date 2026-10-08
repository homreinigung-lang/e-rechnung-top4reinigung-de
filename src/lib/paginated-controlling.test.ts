import { describe, expect, it } from "vitest";
import { approvedWorkTotals } from "./approved-work-totals";
import { fetchAllRows } from "./fetch-all-rows";
import { revenueForMonth } from "./object-controlling";

function paged<T extends { id: string }>(records: T[], serverLimit: number) {
  const starts: number[] = [];
  return {
    starts,
    query: () => ({
      order: () => ({
        range: async (from: number, to: number) => {
          starts.push(from);
          return {
            data: records.slice(from, Math.min(to + 1, from + serverLimit)),
            error: null,
          };
        },
      }),
    }),
  };
}

describe("complete time and project controlling inputs", () => {
  it("includes approved hours beyond the first thousand rows without paying pending entries", async () => {
    const records = Array.from({ length: 1205 }, (_, i) => ({
      id: String(i),
      employee_name: "Mitarbeiter A",
      entry_type: "work",
      approval_status: i < 1100 ? "approved" : "pending",
      hours: 2,
      hourly_rate: 20,
    }));
    const db = paged(records, 200);
    const entries = await fetchAllRows(db.query);
    const totals = approvedWorkTotals(entries);

    expect(entries).toHaveLength(1205);
    expect(totals.hours).toBe(2200);
    expect(totals.amount).toBe(44000);
    expect(db.starts.at(-1)).toBe(1205);
  });

  it("includes invoices from later pages when computing project revenue", async () => {
    const records = Array.from({ length: 1107 }, (_, i) => ({
      id: String(i),
      issue_date: "2026-10-08",
      service_period: "",
      net_total: 10,
    }));
    const db = paged(records, 250);
    const invoices = await fetchAllRows(db.query);
    expect(invoices.reduce((total, invoice) => total + revenueForMonth(invoice, "2026-10"), 0))
      .toBe(11070);
    expect(db.starts.at(-1)).toBe(1107);
  });
});
