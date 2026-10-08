import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all-rows";

function source(total: number, serverLimit = 500, failAt?: number) {
  const records = Array.from({ length: total }, (_, id) => ({ id: String(id), amount: 2 }));
  const requests: [number, number][] = [];
  return {
    requests,
    query: () => ({
      order: () => ({
        range: async (from: number, to: number) => {
          requests.push([from, to]);
          if (from === failAt) return { data: null, error: new Error("Netzwerkfehler") };
          return { data: records.slice(from, Math.min(to + 1, from + serverLimit)), error: null };
        },
      }),
    }),
  };
}

describe("complete report loading", () => {
  it("includes invoices beyond the first 1,000 rows in totals", async () => {
    const db = source(1207);
    const rows = await fetchAllRows(db.query);
    expect(rows).toHaveLength(1207);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1207);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(2414);
  });

  it("continues through a server limit smaller than the requested page", async () => {
    const db = source(251, 100);
    const rows = await fetchAllRows(db.query);
    expect(rows).toHaveLength(251);
    expect(db.requests.map(([from]) => from)).toEqual([0, 100, 200, 251]);
  });

  it("rejects instead of returning a partial total when a later request fails", async () => {
    const db = source(1207, 500, 500);
    await expect(fetchAllRows(db.query)).rejects.toThrow("Netzwerkfehler");
  });

  it("accepts an empty report", async () => {
    expect(await fetchAllRows(source(0).query)).toEqual([]);
  });
});

it("rejects overlapping pages rather than counting records twice", async () => {
  const query = () => ({
    order: () => ({
      range: async () => ({ data: [{ id: "same-row" }], error: null }),
    }),
  });
  await expect(fetchAllRows(query)).rejects.toThrow("erneut laden");
});

it("preserves primary list ordering with a unique id tie-breaker across pages", async () => {
  const records = [
    { id: "c", created_at: "2026-10-08" },
    { id: "a", created_at: "2026-10-08" },
    { id: "b", created_at: "2026-10-07" },
    { id: "d", created_at: "2026-10-07" },
  ];
  const calls: string[] = [];
  const query = () => ({
    order: (column: string, options: { ascending: boolean }) => {
      calls.push(`${column}:${options.ascending}`);
      return {
        range: async (from: number, to: number) => ({
          data: [...records]
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
            .slice(from, Math.min(to + 1, from + 2)),
          error: null,
        }),
      };
    },
  });
  const rows = await fetchAllRows(query);
  expect(rows.map((row) => row.id)).toEqual(["a", "c", "b", "d"]);
  expect(calls).toEqual(["id:true", "id:true", "id:true"]);
});
