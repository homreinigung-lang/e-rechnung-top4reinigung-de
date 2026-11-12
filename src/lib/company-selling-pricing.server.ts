import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CompanySellingPricing } from "./company-selling-pricing";
import type { PerformanceRate } from "./leistungswerte";

/** Read the authenticated company's own performance values; the selling rate belongs to this job. */
export async function loadCompanySellingPricing(db: SupabaseClient<Database>, userId: string, hourlyRate: number | null = null): Promise<CompanySellingPricing> {
  const rates = await db.from("performance_rates")
    .select("id,label,usage_type,floor_covering,sqm_per_hour,minutes_per_floor,active")
    .eq("user_id", userId).eq("active", true).order("label");
  if (rates.error) throw new Error("Gespeicherte Leistungswerte konnten nicht geladen werden. Bitte erneut versuchen.");
  return { hourlyRate, rates: (rates.data ?? []) as PerformanceRate[] };
}
