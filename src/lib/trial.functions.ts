import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Länge der kostenlosen Testphase für neue Firmen (2 Monate). */
export const FREE_TRIAL_DAYS = 60;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Legt für ein neu registriertes Firmenkonto automatisch eine kostenlose
 * Testphase an (Status "trial", Laufzeit FREE_TRIAL_DAYS Tage).
 * Mitarbeiter-Konten erhalten kein eigenes Abonnement.
 */
export const ensureTrialSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;

    const existing = await supabaseAdmin
      .from("subscriptions")
      .select("id,status,renews_on")
      .eq("user_id", uid)
      .maybeSingle();
    if (existing.data) return { created: false, subscription: existing.data };

    // Mitarbeitende bekommen kein Firmen-Abonnement.
    const employee = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("auth_user_id", uid)
      .limit(1);
    if ((employee.data ?? []).length > 0) return { created: false, subscription: null };

    const settings = await supabaseAdmin
      .from("company_settings")
      .select("company_name,city,email")
      .eq("user_id", uid)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: uid,
        company_name: settings.data?.company_name ?? "",
        city: settings.data?.city ?? "",
        contact_email: settings.data?.email ?? String(context.claims?.["email"] ?? ""),
        plan: "basis",
        status: "trial",
        visible_on_landing: false,
        note: `Automatische Testphase über ${FREE_TRIAL_DAYS} Tage`,
        started_on: new Date().toISOString().slice(0, 10),
        renews_on: addDays(FREE_TRIAL_DAYS),
      })
      .select("id,status,renews_on")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { created: true, subscription: data };
  });
