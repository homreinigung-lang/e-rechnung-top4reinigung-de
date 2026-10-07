import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const ordering: { column: string; ascending: boolean }[] = [];
      const query = {
        select: () => query,
        is: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        gte: (column: string, value: string) => {
          filters.push((row) => String(row[column]) >= value);
          return query;
        },
        lte: (column: string, value: string) => {
          filters.push((row) => String(row[column]) <= value);
          return query;
        },
        order: (column: string, options: { ascending: boolean }) => {
          ordering.push({ column, ascending: options.ascending });
          return query;
        },
        range: async (from: number, to: number) => {
          const visible = state.tables[table].filter((row) =>
            filters.every((filter) => filter(row)),
          );
          visible.sort((a, b) => {
            for (const { column, ascending } of ordering) {
              const comparison = String(a[column]).localeCompare(String(b[column]));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          return { data: visible.slice(from, Math.min(to + 1, from + 100)), error: null };
        },
      };
      return query;
    },
  },
}));

import { fetchEuerDocuments, fetchEuerExpenses } from "./euer-data";

beforeEach(() => {
  const records = Array.from({ length: 1007 }, (_, index) => ({
    id: String(index).padStart(4, "0"),
    issue_date: "2026-10-07",
    expense_date: "2026-10-07",
    deleted_at: null,
    total: 10,
    net_amount: 8,
  }));
  state.tables.documents = [
    ...records,
    { id: "deleted", issue_date: "2026-10-07", deleted_at: "2026-10-08" },
    { id: "outside", issue_date: "2026-09-30", deleted_at: null },
  ];
  state.tables.expenses = [
    ...records,
    { id: "deleted", expense_date: "2026-10-07", deleted_at: "2026-10-08" },
    { id: "outside", expense_date: "2026-09-30", deleted_at: null },
  ];
});

describe("complete EÜR data", () => {
  it("keeps date and trash filters on every invoice page, even with identical dates", async () => {
    const rows = await fetchEuerDocuments({ from: "2026-10-01", to: "2026-10-31" });
    expect(rows).toHaveLength(1007);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1007);
    expect(rows.reduce((sum, row) => sum + Number(row.total), 0)).toBe(10070);
  });

  it("loads every expense in the selected period", async () => {
    const rows = await fetchEuerExpenses({ from: "2026-10-01", to: "2026-10-31" });
    expect(rows).toHaveLength(1007);
    expect(rows.reduce((sum, row) => sum + Number(row.net_amount), 0)).toBe(8056);
  });

  it("includes earlier periods when the dashboard requests all documents", async () => {
    const rows = await fetchEuerDocuments();
    expect(rows).toHaveLength(1008);
    expect(rows.at(-1)?.id).toBe("outside");
  });
});
