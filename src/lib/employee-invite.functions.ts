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

/**
 * Versendet eine Mitarbeiter-Einladung über denselben zentralen Resend-Versand
 * wie Angebote, Rechnungen und Steuerberater-Einladungen. Die Firmen-E-Mail
 * erhält automatisch eine Kopie als Versandbestätigung.
 */
export const sendEmployeeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email(),
        origin: z.string().trim().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: settings, error } = await context.supabase
      .from("company_settings")
      .select("company_name,email,invite_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settings?.invite_code) {
      throw new Error("Unternehmens-Code fehlt. Bitte zuerst einen Einladungs-Code erzeugen.");
    }

    const companyName = settings.company_name || "Ihr Arbeitgeber";
    const companyEmail = settings.email?.trim() || undefined;
    const origin = /^https?:\/\//.test(data.origin || "")
      ? String(data.origin).replace(/\/$/, "")
      : process.env["PUBLIC_SITE_URL"] || "https://e-rechnung.top4reinigung.de";
    const link = `${origin}/auth?code=${encodeURIComponent(settings.invite_code)}`;

    const subject = `Einladung als Mitarbeiter/in – ${companyName}`;
    const text = `Guten Tag,\n\n${companyName} lädt Sie zur Mitarbeiter-Nutzung von GebCalc ein.\n\nRegistrierungslink: ${link}\nUnternehmens-Code: ${settings.invite_code}\n\nBitte verwenden Sie für die Registrierung die E-Mail-Adresse, an die diese Einladung gesendet wurde.\n\nMit freundlichen Grüßen\n${companyName}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">
      <h2 style="margin:0 0 12px">Mitarbeiter-Einladung</h2>
      <p>Guten Tag,</p>
      <p><strong>${escapeHtml(companyName)}</strong> lädt Sie zur Mitarbeiter-Nutzung von GebCalc ein.</p>
      <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Registrierung öffnen</a></p>
      <p>Unternehmens-Code: <strong>${escapeHtml(settings.invite_code)}</strong></p>
      <p style="color:#64748b;font-size:13px">Bitte verwenden Sie für die Registrierung die E-Mail-Adresse, an die diese Einladung gesendet wurde.</p>
      <p style="margin-top:28px;color:#64748b;font-size:12px">${escapeHtml(companyName)}</p>
    </div>`;

    const { sendVerifiedEmail } = await import("./resend-email.server");
    const result = await sendVerifiedEmail({
      to: data.email,
      subject,
      text,
      html,
      companyName,
      ...(companyEmail ? { companyEmail } : {}),
    });

    return { accepted: true as const, to: data.email, id: result.id, cc: result.cc };
  });

function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
