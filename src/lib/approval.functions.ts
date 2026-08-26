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
        email: z.string().email().max(200).optional(),
        fullName: z.string().max(200).optional(),
        companyName: z.string().max(200).optional(),
        employeeCount: z.number().int().min(0).max(100000).optional(),
        legalForm: z.string().max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(data.authUserId);
    const user = userData?.user ?? null;
    if (!user) {
      // Kommt vor, wenn die Registrierung eine E-Mail-Bestätigung erfordert oder
      // die Adresse bereits existiert – dann gibt es (noch) kein echtes Konto.
      return { status: "pending" as const };
    }
    const email = (user.email ?? data.email ?? "").toLowerCase();
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
    const employee = await supabaseAdmin
      .from("employees")
      .select("id")
      .ilike("email", email)
      .limit(1);
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

/**
 * Reparatur-Registrierung: Wenn die E-Mail bereits in der Anmeldeverwaltung
 * existiert, das Konto aber unvollständig ist (kein Firmenprofil, keine
 * Freigabe, kein Abo), wird es zurückgesetzt: neues Passwort, bestätigte
 * E-Mail. Vollständige Konten bleiben unangetastet.
 */
export const recoverIncompleteAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(6).max(200),
        fullName: z.string().max(200).optional(),
        companyName: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    // Benutzer anhand der E-Mail suchen.
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const list = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (list.error) throw new Error(list.error.message);
      const users = list.data?.users ?? [];
      const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) userId = hit.id;
      if (users.length < 200) break;
    }
    if (!userId) return { recovered: false as const, reason: "not_found" as const };

    // Vollständigkeit prüfen: Firmenprofil ODER echte Nutzdaten vorhanden?
    const [settings, docs, customers, employeeLink] = await Promise.all([
      supabaseAdmin
        .from("company_settings")
        .select("id,company_name")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin.from("documents").select("id").eq("user_id", userId).limit(1),
      supabaseAdmin.from("customers").select("id").eq("user_id", userId).limit(1),
      supabaseAdmin.from("employees").select("id").eq("auth_user_id", userId).limit(1),
    ]);

    const hasData =
      (docs.data ?? []).length > 0 ||
      (customers.data ?? []).length > 0 ||
      (employeeLink.data ?? []).length > 0 ||
      Boolean((settings.data?.company_name ?? "").trim());

    if (hasData) return { recovered: false as const, reason: "in_use" as const };

    // Unvollständiges Konto: Passwort setzen und E-Mail bestätigen.
    const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: (data.fullName ?? "").trim(),
        company_name: (data.companyName ?? "").trim(),
      },
    });
    if (upd.error) throw new Error(upd.error.message);

    return { recovered: true as const, userId };
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
  .inputValidator((input: unknown) => z.object({ approvalId: z.string().uuid() }).parse(input))
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
