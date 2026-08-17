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

/** Liefert eine zeitlich begrenzte Download-Adresse für den Beleg einer Ausgabe. */
export const getAccountantReceiptUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; expenseId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: access } = await supabaseAdmin
      .from("accountant_access")
      .select("user_id, access_code, active")
      .eq("token", data.token)
      .maybeSingle();

    if (
      !access ||
      !access.active ||
      access.access_code.toUpperCase() !== normalizeCode(data.code ?? "")
    ) {
      throw new Error("Zugang ungültig.");
    }

    const { data: expense } = await supabaseAdmin
      .from("expenses")
      .select("receipt_url")
      .eq("id", data.expenseId)
      .eq("user_id", access.user_id)
      .maybeSingle();

    const path = expense?.receipt_url ?? "";
    if (!path) throw new Error("Zu dieser Ausgabe ist kein Beleg hinterlegt.");
    if (/^https?:/.test(path)) return path;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("firmen-dateien")
      .createSignedUrl(path, 60 * 60);
    if (error || !signed?.signedUrl) throw new Error("Beleg konnte nicht geladen werden.");
    return signed.signedUrl;
  });

/** Liefert alle Belege eines Monats als Liste signierter Download-Adressen (ZIP-Export). */
export const getAccountantMonthReceipts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; code: string; month: string }) => data)
  .handler(async ({ data }): Promise<Array<{ name: string; url: string }>> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: access } = await supabaseAdmin
      .from("accountant_access")
      .select("user_id, access_code, active")
      .eq("token", data.token)
      .maybeSingle();

    if (
      !access ||
      !access.active ||
      access.access_code.toUpperCase() !== normalizeCode(data.code ?? "")
    ) {
      throw new Error("Zugang ungültig.");
    }

    if (!/^\d{4}-\d{2}$/.test(data.month)) throw new Error("Ungültiger Monat.");
    const start = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const endDate = new Date(Date.UTC(y!, m!, 1));
    const end = endDate.toISOString().slice(0, 10);

    const { data: expenses } = await supabaseAdmin
      .from("expenses")
      .select("id, expense_date, supplier, category, document_number, receipt_url")
      .eq("user_id", access.user_id)
      .gte("expense_date", start)
      .lt("expense_date", end)
      .order("expense_date", { ascending: true });

    const out: Array<{ name: string; url: string }> = [];
    let index = 1;
    for (const e of expenses ?? []) {
      const path = e.receipt_url ?? "";
      if (!path) continue;
      const ext = path.split(".").pop()?.toLowerCase() || "pdf";
      const label = [
        String(index).padStart(2, "0"),
        e.expense_date,
        (e.supplier || "Beleg")
          .replace(/[^\w\s-]+/g, "")
          .trim()
          .replace(/\s+/g, "-"),
        (e.category || "").replace(/[^\w-]+/g, ""),
      ]
        .filter(Boolean)
        .join("_");

      if (/^https?:/.test(path)) {
        out.push({ name: `${label}.${ext}`, url: path });
      } else {
        const { data: signed } = await supabaseAdmin.storage
          .from("firmen-dateien")
          .createSignedUrl(path, 60 * 30);
        if (signed?.signedUrl) out.push({ name: `${label}.${ext}`, url: signed.signedUrl });
      }
      index += 1;
    }

    return out;
  });
