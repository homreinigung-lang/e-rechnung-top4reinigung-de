import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ errorTable: "", pages: [] as number[] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: unknown) => fn,
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./accountant-access.server", () => ({
  verifyAccountantAccess: async () => ({ user_id: "owner" }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let offset = 0;
      let paginated = false;
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        neq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        maybeSingle: () => chain,
        range: (from: number) => {
          offset = from;
          paginated = true;
          state.pages.push(from);
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve().then(() =>
            resolve({
              data:
                state.errorTable === table
                  ? null
                  : table === "company_settings"
                    ? { company_name: "Synthetic" }
                    : Array.from({ length: 1207 }, (_, i) => ({
                        id: `${table}-${i}`,
                        approval_status: "approved",
                      })).slice(offset, offset + (paginated ? 200 : 1000)),
              error: state.errorTable === table ? new Error("Database unavailable") : null,
            }),
          ),
      };
      return chain;
    },
  },
}));
import { getAccountantReport, type AccountantReport } from "./accountant.functions";
const report = getAccountantReport as unknown as (input: {
  data: { token: string; code: string; from: string; to: string };
}) => Promise<AccountantReport>;
const request = {
  data: { token: "synthetic", code: "synthetic", from: "2026-01-01", to: "2026-12-31" },
};
beforeEach(() => {
  state.errorTable = "";
  state.pages = [];
});
it("loads every report table beyond the API cap, including short pages", async () => {
  const result = await report(request);
  for (const key of [
    "documents",
    "expenses",
    "timeEntries",
    "wageTypes",
    "holidays",
    "adjustments",
    "fahrtenbuchEntries",
    "fahrtenbuchVehicles",
  ] as const)
    expect(result[key]).toHaveLength(1207);
  expect(state.pages).toContain(1207);
});
it.each(["expenses", "time_entries", "company_settings"])(
  "rejects %s failures instead of returning a deceptively empty report",
  async (table) => {
    state.errorTable = table;
    await expect(report(request)).rejects.toThrow();
  },
);
