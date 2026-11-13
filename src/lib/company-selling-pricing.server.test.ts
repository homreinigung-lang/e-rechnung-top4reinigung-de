import { beforeEach, expect, it, vi } from "vitest";
import { loadCompanySellingPricing } from "./company-selling-pricing.server";
const userId = "authenticated-owner";
const calls: Array<[string, string, unknown]> = [];
let error: unknown = null;
let settings: Record<string, number> | null = null;
let settingsError: unknown = null;
const db = {
  from: vi.fn((table: string) => {
    const result = { data: table === "company_settings" ? settings : [], error: table === "company_settings" ? settingsError : error };
    const builder = {
      select: (_columns: string) => builder,
      eq: (key: string, value: unknown) => { calls.push([table, key, value]); return builder; },
      maybeSingle: async () => result,
      order: async () => result,
    };
    return builder;
  }),
};
beforeEach(() => { vi.clearAllMocks(); calls.length = 0; error = null; settingsError = null; settings = { calc_worker_hourly_wage: 20, calc_labor_burden_percent: 30, calc_material_cost_hour: 2, calc_overhead_cost_hour: 4, calc_profit_markup_percent: 25 }; });
it("loads only the authenticated owner's active performance values and accepts this job's agreed selling price", async () => {
  const result = await loadCompanySellingPricing(db as never, userId, 41);
  expect(result).toEqual({ hourlyRate: 41, rates: [] });
  expect(db.from).not.toHaveBeenCalledWith("company_settings");
  expect(calls).toContainEqual(["performance_rates", "user_id", userId]);
  expect(calls).toContainEqual(["performance_rates", "active", true]);
});
it("fails closed on database errors instead of returning estimated prices", async () => {
  error = { message: "read failed" };
  await expect(loadCompanySellingPricing(db as never, userId)).rejects.toThrow("konnten nicht geladen werden");
});

it("derives the target selling rate from the authenticated company's saved cost basis", async () => {
  const result = await loadCompanySellingPricing(db as never, userId);
  expect(result.hourlyRate).toBe(40);
  expect(result.source).toBe("company");
  expect(result.costBasis).toEqual({ selfCostPerHour: 32, profitMarkupPercent: 25 });
  expect(calls).toContainEqual(["company_settings", "user_id", userId]);
});
it("does not invent company costs when settings are absent", async () => {
  settings = null;
  expect((await loadCompanySellingPricing(db as never, userId)).hourlyRate).toBeNull();
});
it("does not replace a company settings read error with guessed values", async () => {
  settingsError = { message: "unavailable" };
  await expect(loadCompanySellingPricing(db as never, userId)).rejects.toThrow("Kalkulationsgrundlagen");
});
