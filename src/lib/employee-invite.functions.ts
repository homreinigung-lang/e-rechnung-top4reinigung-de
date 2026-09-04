import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Normalisiert einen Unternehmens-Code (Groß, ohne Leerzeichen/Bindestriche). */
export function normalizeInviteCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Mitarbeiter-Registrierung: Der eingegebene Unternehmens-Code entscheidet,
 * zu welcher Firma das Konto gehört. Ohne gültigen Code ist keine
 * Mitarbeiter-Registrierung möglich.
 */
export const redeemInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(4).max(32),
        fullName: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = normalizeInviteCode(data.code);
    const userId = context.userId;
    const email = String(context.claims?.["email"] ?? "").toLowerCase();
    if (!email) throw new Error("Für dieses Konto ist keine E-Mail-Adresse hinterlegt.");

    // Schutz vor dem Durchprobieren von Codes: maximal 5 Versuche je Konto
    // und Stunde. Jeder Versuch wird gezählt, unabhängig vom Ergebnis.
    const { allowPublicMail } = await import("./mail-throttle.server");
    const allowed = await allowPublicMail({
      email: `invite:${userId}`,
      limitPerEmail: 5,
      windowEmailMinutes: 60,
      limitPerIp: 30,
      windowIpMinutes: 60,
    });
    if (!allowed) {
      throw new Error("Zu viele Versuche. Bitte später erneut versuchen.");
    }

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("user_id,company_name")
      .eq("invite_code", code)
      .maybeSingle();

    if (!company) {
      return { ok: false as const, reason: "invalid" as const };
    }

    // Mitarbeitende dürfen kein eigenes Firmenkonto sein.
    if (company.user_id === userId) {
      return { ok: false as const, reason: "own_company" as const };
    }

    // Bereits verknüpft?
    const { data: linked } = await supabaseAdmin
      .from("employees")
      .select("id,user_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (linked) {
      if (linked.user_id !== company.user_id) {
        return { ok: false as const, reason: "other_company" as const };
      }
      return { ok: true as const, employeeId: linked.id, companyName: company.company_name };
    }

    // Vorhandenen Personalsatz derselben Firma per E-Mail übernehmen …
    const { data: match } = await supabaseAdmin
      .from("employees")
      .select("id,auth_user_id")
      .eq("user_id", company.user_id)
      .ilike("email", email)
      .is("auth_user_id", null)
      .maybeSingle();

    if (match) {
      const { error } = await supabaseAdmin
        .from("employees")
        .update({ auth_user_id: userId })
        .eq("id", match.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, employeeId: match.id, companyName: company.company_name };
    }

    // … sonst neuen Personalsatz für die Firma anlegen.
    const { data: created, error: insErr } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: company.user_id,
        auth_user_id: userId,
        name: (data.fullName ?? "").trim() || email.split("@")[0] || "Mitarbeiter/in",
        email,
        role: "Reinigungskraft",
        active: true,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { ok: true as const, employeeId: created.id, companyName: company.company_name };
  });
