import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
function validateMonth<T extends { month: string }>(data: T): T {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))
    throw new Error("Bitte gültigen Monat auswählen.");
  return data;
}
export const getAccountantFahrtenbuchMonth = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => validateMonth(data))
  .handler(async ({ data }) => {
    const { verifyAccountantAccess } = await import("@/lib/accountant-access.server");
    const { user_id } = await verifyAccountantAccess(data.token, data.code);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMonthlyFahrtenbuch } = await import("./fahrtenbuch.server");
    return loadMonthlyFahrtenbuch(supabaseAdmin, user_id, data.month);
  });
export const getOwnerFahrtenbuchMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { month: string }) => validateMonth(data))
  .handler(async ({ data, context }) => {
    const { loadMonthlyFahrtenbuch } = await import("./fahrtenbuch.server");
    return loadMonthlyFahrtenbuch(context.supabase, context.userId, data.month);
  });
