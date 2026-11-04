import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  denied: false,
  end: 87891 as number | null,
  queries: [] as { table: string; filters: [string, unknown][] }[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (data: unknown) => unknown;
    const chain = {
      inputValidator: (fn: typeof validator) => {
        validator = fn;
        return chain;
      },
      handler: (fn: (input: unknown) => unknown) => async (input: { data: unknown }) =>
        fn({ data: validator(input.data) }),
    };
    return chain;
  },
}));
vi.mock("@/lib/accountant-access.server", () => ({
  verifyAccountantAccess: async () => {
    if (state.denied) throw new Error("Access denied");
    return { user_id: "owner" };
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query = { table, filters: [] as [string, unknown][] };
      state.queries.push(query);
      const rows: Record<string, unknown> = {
        fahrtenbuch_entries: [
          {
            id: "trip",
            vehicle_id: "car",
            trip_date: "2026-10-01",
            distance_km: 400,
            start_km: 87312,
            end_km: 87712,
            employee_id: "PRIVATE_DRIVER",
          },
        ],
        fahrtenbuch_vehicles: [{ id: "car", vehicle_name: "Nemo", license_plate: "VK-RH 25" }],
        fahrtenbuch_monthly_odometer: [
          { id: "reading", vehicle_id: "car", start_km: 87312, end_km: state.end },
        ],
        company_settings: {
          company_name: "Owner company",
          logo_url: "https://example.com/logo.png",
        },
      };
      let offset = 0;
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          query.filters.push([key, value]);
          return chain;
        },
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        range: (start: number) => {
          offset = start;
          return chain;
        },
        maybeSingle: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: offset ? [] : rows[table], error: null })),
      };
      return chain;
    },
  },
}));
import { getAccountantFahrtenbuchMonth } from "./accountant/fahrtenbuch.functions";
const report = getAccountantFahrtenbuchMonth as unknown as (input: {
  data: { token: string; code: string; month: string };
}) => Promise<{ summaries: unknown[]; rows: Record<string, string>[]; from: string; to: string }>;
const request = { data: { token: "test", code: "test", month: "2026-10" } };
beforeEach(() => {
  state.denied = false;
  state.end = 87891;
  state.queries = [];
});
it("exports a full month with the verified owner's saved readings and private difference", async () => {
  const result = await report(request);
  expect(result.from).toBe("2026-10-01");
  expect(result.to).toBe("2026-10-31");
  expect(result.summaries[0]).toMatchObject({
    startKm: 87312,
    endKm: 87891,
    totalKm: 579,
    businessKm: 400,
    privateKm: 179,
  });
  for (const query of state.queries) expect(query.filters).toContainEqual(["user_id", "owner"]);
  expect(JSON.stringify(result.rows)).not.toContain("PRIVATE_DRIVER");
});
it("checks portal access before reading any tenant data", async () => {
  state.denied = true;
  await expect(report(request)).rejects.toThrow("Access denied");
  expect(state.queries).toHaveLength(0);
});
it("rejects invalid months before database access", async () => {
  await expect(report({ data: { ...request.data, month: "2026-13" } })).rejects.toThrow();
  expect(state.queries).toHaveLength(0);
});
it("requires a saved closing reading", async () => {
  state.end = null;
  await expect(report(request)).rejects.toThrow(/Monatsende/);
});
