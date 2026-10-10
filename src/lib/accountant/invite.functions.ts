import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCode, randomCode } from "./shared";

export const sendAccountantInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; email: string; origin?: string; password?: string }) => ({
    id: String(data.id ?? ""),
    email: String(data.email ?? "").trim(),
    origin: String(data.origin ?? "").trim(),
    password: normalizeCode(String(data.password ?? "")),
  }))
  .handler(async ({ data, context }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
    }
    if (data.password && data.password.length < 8) {
      throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    }

    const { data: access, error } = await context.supabase
      .from("accountant_access")
      .select("id, token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!access) throw new Error("Zugang nicht gefunden.");

    // Das Passwort ist nur als Prüfsumme gespeichert und kann nicht mehr
    // ausgelesen werden. Für die Einladung wird deshalb ein neues Passwort
    // gesetzt (entweder das eingegebene oder ein zufälliges).
    const accessCode = data.password || randomCode();
    const { hashAccessCode } = await import("@/lib/accountant-access.server");
    const { error: pwError } = await context.supabase
      .from("accountant_access")
      .update({
        access_code: "",
        access_code_hash: await hashAccessCode(access.token as string, accessCode),
        active: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", access.id)
      .eq("user_id", context.userId);
    if (pwError) throw new Error(pwError.message);

    const { data: settings } = await context.supabase
      .from("company_settings")
      .select("company_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const companyName = settings?.company_name || "Ihr Mandant";
    const companyEmail = settings?.email || undefined;

    const { sendMail, siteUrl, escapeHtml } = await import("@/lib/approval-mail.server");
    const base = /^https?:\/\//.test(data.origin) ? data.origin.replace(/\/$/, "") : siteUrl();
    const link = `${base}/stb/${access.token}`;

    const subject = `Steuerberater-Zugang von ${companyName}`;
    const text = `Guten Tag,

anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von ${companyName} (DATEV- und Excel-Export inklusive). Die DATEV-Einstellungen (SKR03/SKR04 sowie Berater- und Mandantennummer) dürfen Sie selbst pflegen. Andere Unternehmensdaten bleiben schreibgeschützt.

Zugangs-Link: ${link}
Passwort: ${accessCode}

Bitte bewahren Sie das Passwort sicher auf – es kann aus Sicherheitsgründen nicht erneut angezeigt werden.

Mit freundlichen Grüßen
${companyName}`;

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">
      <h2 style="margin:0 0 12px">Ihr Steuerberater-Zugang</h2>
      <p>Guten Tag,</p>
      <p>anbei Ihr persönlicher Nur-Lese-Zugang zu den Rechnungen und Ausgaben von <strong>${escapeHtml(companyName)}</strong> (DATEV- und Excel-Export inklusive).</p>\n      <p>Sie dürfen ausschließlich die DATEV-Einstellungen (SKR03/SKR04 sowie Berater- und Mandantennummer) selbst pflegen. Andere Unternehmensdaten bleiben schreibgeschützt.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Zugang öffnen</a></p>
      <p>Passwort: <strong>${escapeHtml(accessCode)}</strong></p>
      <p style="color:#64748b;font-size:13px">Falls der Button nicht funktioniert: ${escapeHtml(link)}</p>
      <p style="margin-top:28px;color:#64748b;font-size:12px">${escapeHtml(companyName)}</p>
    </div>`;

    const delivery = await sendMail({
      to: data.email,
      subject,
      html,
      text,
      companyName,
      ...(companyEmail ? { companyEmail } : {}),
    });

    if (data.email) {
      await context.supabase
        .from("accountant_access")
        .update({ email: data.email, invited_at: new Date().toISOString() })
        .eq("id", access.id)
        .eq("user_id", context.userId);
    }

    return { accepted: true as const, to: data.email, messageId: delivery.id, accessCode, link };
  });
