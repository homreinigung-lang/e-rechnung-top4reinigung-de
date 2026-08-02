import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountantReport = {
  companyName: string;
  documents: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
};

/** Erstellt einen neuen Nur-Lese-Zugang für den Steuerberater. */
export const createAccountantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string }) => ({ email: (data.email ?? "").trim() }))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const accessCode = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => (b % 36).toString(36))
      .join("")
      .toUpperCase();

    const { error } = await context.supabase.from("accountant_access").insert({
      user_id: context.userId,
      email: data.email,
      token,
      access_code: accessCode,
    });
    if (error) throw new Error(error.message);

    return { token, accessCode };
  });

/** Prüft Token + Passwort und liefert die Auswertung des Zeitraums (nur Lesen). */
export const getAccountantReport = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<AccountantReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: access } = await supabaseAdmin
      .from("accountant_access")
      .select("id, user_id, access_code, active, expires_at")
      .eq("token", data.token)
      .maybeSingle();

    if (
      !access ||
      !access.active ||
      new Date(access.expires_at).getTime() < Date.now() ||
      access.access_code.toUpperCase() !== (data.code ?? "").trim().toUpperCase()
    ) {
      throw new Error("Zugang ungültig oder abgelaufen.");
    }

    await supabaseAdmin
      .from("accountant_access")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", access.id);

    const [documents, expenses, settings] = await Promise.all([
      supabaseAdmin
        .from("documents")
        .select("*")
        .eq("user_id", access.user_id)
        .eq("type", "invoice")
        .gte("issue_date", data.from)
        .lte("issue_date", data.to)
        .order("issue_date"),
      supabaseAdmin
        .from("expenses")
        .select("*")
        .eq("user_id", access.user_id)
        .gte("expense_date", data.from)
        .lte("expense_date", data.to)
        .order("expense_date"),
      supabaseAdmin
        .from("company_settings")
        .select("company_name")
        .eq("user_id", access.user_id)
        .maybeSingle(),
    ]);

    return {
      companyName: settings.data?.company_name ?? "",
      documents: (documents.data ?? []) as Record<string, unknown>[],
      expenses: (expenses.data ?? []) as Record<string, unknown>[],
    };
  });
