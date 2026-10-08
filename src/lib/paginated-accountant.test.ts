import { describe, expect, it } from "vitest";
import { approvedWorkTotals } from "./approved-work-totals";
import { computeEuer } from "./euer";
import { fetchAllRows } from "./fetch-all-rows";

function paged<T extends { id: string }>(records: T[], serverLimit: number, failAt?: number) {
  const offsets: number[] = [];
  return {
    offsets,
    query: () => ({
      order: () => ({
        range: async (from: number, to: number) => {
          offsets.push(from);
          if (from === failAt) return { data: null, error: new Error("Seite nicht verfügbar") };
          return { data: records.slice(from, Math.min(to + 1, from + serverLimit)), error: null };
        },
      }),
    }),
  };
}

describe("complete Steuerberater exports", () => {
  it("calculates EÜR from every invoice and expense even beyond the API row cap", async () => {
    const invoices = Array.from({ length: 1207 }, (_, i) => ({
      id: `invoice-${i}`,
      type: "invoice",
      status: "paid",
      issue_date: "2026-10-08",
      paid_at: "2026-10-08",
      net_total: 10,
      total: 10,
      vat_amount: 0,
    }));
    const expenses = Array.from({ length: 1103 }, (_, i) => ({
      id: `expense-${i}`,
      expense_date: "2026-10-08",
      category: "Material",
      net_amount: 3,
      gross_amount: 3,
      vat_amount: 0,
    }));
    const invoiceDb = paged(invoices, 250);
    const expenseDb = paged(expenses, 300);
    const result = computeEuer(
      await fetchAllRows(invoiceDb.query),
      await fetchAllRows(expenseDb.query),
      "2026-10-01",
      "2026-10-31",
    );

    expect(result.incomeCount).toBe(1207);
    expect(result.expenseCount).toBe(1103);
    expect(result.incomeNet).toBe(12070);
    expect(result.expenseNet).toBe(3309);
    expect(result.profit).toBe(8761);
    expect(invoiceDb.offsets.at(-1)).toBe(1207);
    expect(expenseDb.offsets.at(-1)).toBe(1103);
  });

  it("includes all payable work hours but excludes pending hours from payroll totals", async () => {
    const entries = Array.from({ length: 1205 }, (_, i) => ({
      id: `entry-${i}`,
      entry_type: "work",
      approval_status: i < 1100 ? "approved" : "pending",
      employee_name: "Test",
      hours: 2,
      hourly_rate: 15,
    }));
    const db = paged(entries, 200);
    const loaded = await fetchAllRows(db.query);
    expect(loaded).toHaveLength(1205);
    expect(approvedWorkTotals(loaded)).toMatchObject({ hours: 2200, amount: 33000 });
  });

  it("does not return partial accounting data when a later page fails", async () => {
    const records = Array.from({ length: 1001 }, (_, i) => ({ id: String(i) }));
    await expect(fetchAllRows(paged(records, 500, 500).query)).rejects.toThrow(
      "Seite nicht verfügbar",
    );
  });
});
