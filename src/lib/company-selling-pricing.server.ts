import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { companyCostSellingBasis, type CompanySellingPricing } from "./company-selling-pricing";
import type { PerformanceRate } from "./leistungswerte";

/** Load only this company's saved values. An agreed job rate overrides the cost-based target. */
export async function loadCompanySellingPricing(db: SupabaseClient<Database>, userId: string, hourlyRate: number | null = null): Promise<CompanySellingPricing> {
  const rates = await db.from("performance_rates")
    .select("id,label,usage_type,floor_covering,sqm_per_hour,minutes_per_floor,active")
    .eq("user_id", userId).eq("active", true).order("label");
  if (rates.error) throw new Error("Gespeicherte Leistungswerte konnten nicht geladen werden. Bitte erneut versuchen.");
  if (hourlyRate !== null && Number.isFinite(hourlyRate) && hourlyRate > 0)
    return { hourlyRate, rates: (rates.data ?? []) as PerformanceRate[] };
  const settings = await db.from("company_settings")
    .select("calc_worker_hourly_wage,calc_labor_burden_percent,calc_material_cost_hour,calc_overhead_cost_hour,calc_profit_markup_percent")
    .eq("user_id", userId).maybeSingle();
  if (settings.error) throw new Error("Gespeicherte Kalkulationsgrundlagen konnten nicht geladen werden. Bitte erneut versuchen.");
  const basis = companyCostSellingBasis(settings.data);
  return {
    hourlyRate: basis?.hourlyRate ?? null,
    rates: (rates.data ?? []) as PerformanceRate[],
    source: "company",
    ...(basis ? { costBasis: { selfCostPerHour: basis.selfCostPerHour, profitMarkupPercent: basis.profitMarkupPercent } } : {}),
  };
}
