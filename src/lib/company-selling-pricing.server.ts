import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CompanySellingPricing } from "./company-selling-pricing";
import type { PerformanceRate } from "./leistungswerte";

/** Read only the authenticated company's own sales rates; never accept them from the caller. */
export async function loadCompanySellingPricing(db: SupabaseClient<Database>, userId: string): Promise<CompanySellingPricing> {
  const [settings, rates] = await Promise.all([
    db.from("company_settings").select("calc_selling_hourly_min,calc_selling_hourly_max").eq("user_id", userId).maybeSingle(),
    db.from("performance_rates").select("id,label,usage_type,floor_covering,sqm_per_hour,minutes_per_floor,active").eq("user_id", userId).eq("active", true).order("label"),
  ]);
  if (settings.error || rates.error) throw new Error("Gespeicherte Verkaufspreise und Leistungswerte konnten nicht geladen werden. Bitte erneut versuchen.");
  return { minimum: settings.data?.calc_selling_hourly_min ?? null, maximum: settings.data?.calc_selling_hourly_max ?? null, rates: (rates.data ?? []) as PerformanceRate[] };
}
