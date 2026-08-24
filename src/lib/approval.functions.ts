import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Länge der kostenlosen Testphase für neue Firmen. */
export const TRIAL_DAYS = 60;

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Registrierung abschließen: Firmendaten speichern, Konto sofort freigeben und
 * eine kostenlose Testphase über 60 Tage anlegen. Es gibt keine manuelle
 * Freigabe-Wartezeit mehr.
 */
export const requestAccountApproval = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        authUserId: z.string().uuid(),
        fullName: z.string().max(200).optional(),
        companyName: z.string().max(200).optional(),
        employeeCount: z.number().int().min(0).max(100000).optional(),
        legalForm: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      data.authUserId,
    );
    if (userError || !userData.user) throw new Error("Benutzer nicht gefunden.");
    const user = userData.user;
    const email = (user.email ?? "").toLowerCase();
    const fullName =
      (data.fullName ?? "").trim() ||
      ((user.user_metadata?.["full_name"] as string | undefined) ?? "");
    const companyName = (data.companyName ?? "").trim();
    const now = new Date().toISOString();

    const existing = await supabaseAdmin
      .from("account_approvals")
      .select("id,status")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (existing.data) {
      // Bestehende Konten bleiben unberührt, sofern sie nicht gesperrt sind.
      if (existing.data.status === "pending") {
        await supabaseAdmin
          .from("account_approvals")
          .update({ status: "approved", decided_at: now })
          .eq("id", existing.data.id);
        return { status: "approved" };
      }
      return { status: existing.data.status as string };
    }

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin.from("account_approvals").insert({
      auth_user_id: user.id,
      email,
      full_name: fullName,
      company_name: companyName,
      token,
      status: "approved",
      decided_at: now,
    });
    if (error) throw new Error(error.message);

    // Mitarbeitende bekommen weder Firmenprofil noch Abonnement.
    const employee = await supabaseAdmin.from("employees").select("id").ilike("email", email).limit(1);
    if ((employee.data ?? []).length > 0) return { status: "approved" };

    const settings = await supabaseAdmin
      .from("company_settings")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!settings.data) {
      await supabaseAdmin.from("company_settings").insert({
        user_id: user.id,
        company_name: companyName,
        owner_name: fullName,
        email,
        employee_count: data.employeeCount ?? 0,
        legal_form: (data.legalForm ?? "").trim(),
      });
    }

    const sub = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sub.data) {
      await supabaseAdmin.from("subscriptions").insert({
        user_id: user.id,
        company_name: companyName,
        city: "",
        contact_email: email,
        plan: "basis",
        status: "trial",
        visible_on_landing: false,
        note: `Automatische Testphase über ${TRIAL_DAYS} Tage`,
        started_on: now.slice(0, 10),
        renews_on: isoPlusDays(TRIAL_DAYS),
      });
    }

    return { status: "approved" };
  });

/** Liefert den Freigabestatus des aktuell angemeldeten Kontos. */
export const getApprovalStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ authUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("account_approvals")
      .select("status")
      .eq("auth_user_id", data.authUserId)
      .maybeSingle();
    return { status: (row?.status as string | undefined) ?? "none" };
  });

/**
 * Firmenkonto vollständig löschen – ausschließlich für Administratoren.
 * Entfernt den Anmelde-Zugang samt Freigabe-Eintrag und Abonnement.
 */
export const deleteCompanyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ approvalId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const isAdmin = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin.data !== true) throw new Error("Nur Administratoren dürfen Konten löschen.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("account_approvals")
      .select("id,auth_user_id")
      .eq("id", data.approvalId)
      .maybeSingle();
    if (!row) throw new Error("Konto nicht gefunden.");
    if (row.auth_user_id === context.userId)
      throw new Error("Das eigene Administrationskonto kann nicht gelöscht werden.");

    await supabaseAdmin.from("subscriptions").delete().eq("user_id", row.auth_user_id);
    await supabaseAdmin.from("account_approvals").delete().eq("id", row.id);
    const del = await supabaseAdmin.auth.admin.deleteUser(row.auth_user_id);
    if (del.error) throw new Error(del.error.message);

    return { deleted: true };
  });
