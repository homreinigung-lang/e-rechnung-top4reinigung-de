import { beforeEach, expect, it, vi } from "vitest";
import { loadCompanySellingPricing } from "./company-selling-pricing.server";
const userId = "authenticated-owner";
const calls: Array<[string, string, unknown]> = [];
let error: unknown = null;
const db = {
  from: vi.fn((table: string) => {
    const result = { data: table === "company_settings" ? { calc_selling_hourly_min: 35, calc_selling_hourly_max: 38 } : [], error };
    const builder = {
      select: (_columns: string) => builder,
      eq: (key: string, value: unknown) => { calls.push([table, key, value]); return builder; },
      maybeSingle: async () => result,
      order: async () => result,
    };
    return builder;
  }),
};
beforeEach(() => { calls.length = 0; error = null; });
it("loads only the authenticated owner's selling prices and active performance rates", async () => {
  const result = await loadCompanySellingPricing(db as never, userId);
  expect(result).toEqual({ minimum: 35, maximum: 38, rates: [] });
  expect(calls).toContainEqual(["company_settings", "user_id", userId]);
  expect(calls).toContainEqual(["performance_rates", "user_id", userId]);
  expect(calls).toContainEqual(["performance_rates", "active", true]);
});
it("fails closed on database errors instead of returning estimated prices", async () => {
  error = { message: "read failed" };
  await expect(loadCompanySellingPricing(db as never, userId)).rejects.toThrow("konnten nicht geladen werden");
});
