import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export type AccountantReport = {
  companyName: string;
  documents: Row[];
  expenses: Row[];
  timeEntries: Row[];
};

/** Kein Ablaufdatum: Zugang gilt dauerhaft. */
const NO_EXPIRY = "2999-12-31T00:00:00.000Z";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

/** Erstellt einen neuen dauerhaften Nur-Lese-Zugang für den Steuerberater. */
export const createAccountantAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email?: string; password?: string }) => ({
    email: (data.email ?? "").trim(),
    password: (data.password ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const accessCode = data.password
      ? normalizeCode(data.password)
      : Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map((b) => (b % 36).toString(36))
          .join("")
          .toUpperCase();

    if (data.password && accessCode.length < 4) {
      throw new Error("Passwort muss mindestens 4 Zeichen haben.");
    }

    const { error } = await context.supabase.from("accountant_access").insert({
      user_id: context.userId,
      email: data.email,
      token,
      access_code: accessCode,
      expires_at: NO_EXPIRY,
    });
    if (error) throw new Error(error.message);

    return { token, accessCode };
  });

/** Setzt ein dauerhaftes, selbst gewähltes Passwort für einen bestehenden Zugang. */
export const setAccountantPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; password: string }) => ({
    id: data.id,
    password: normalizeCode(data.password ?? ""),
  }))
  .handler(async ({ data, context }) => {
    if (data.password.length < 4) {
      throw new Error("Passwort muss mindestens 4 Zeichen haben.");
    }
    const { error } = await context.supabase
      .from("accountant_access")
      .update({ access_code: data.password, expires_at: NO_EXPIRY, active: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, accessCode: data.password };
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
      access.access_code.toUpperCase() !== normalizeCode(data.code ?? "")
    ) {
      throw new Error("Zugang ungültig.");
    }


    await supabaseAdmin
      .from("accountant_access")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", access.id);

    const [documents, expenses, timeEntries, settings] = await Promise.all([
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
        .from("time_entries")
        .select("*")
        .eq("user_id", access.user_id)
        .gte("work_date", data.from)
        .lte("work_date", data.to)
        .order("work_date"),
      supabaseAdmin
        .from("company_settings")
        .select("company_name")
        .eq("user_id", access.user_id)
        .maybeSingle(),
    ]);

    return {
      companyName: settings.data?.company_name ?? "",
      documents: (documents.data ?? []) as unknown as Row[],
      expenses: (expenses.data ?? []) as unknown as Row[],
      timeEntries: (timeEntries.data ?? []) as unknown as Row[],
    };
  });
