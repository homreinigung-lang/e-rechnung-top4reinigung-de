import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Versendet den Bestätigungs-/Anmeldelink für die Registrierung über unser
 * Resend-Konto (nicht über den Standard-Mailversand der Auth-Plattform).
 * Der bestehende Rechnungs- und Angebotsversand bleibt davon unberührt.
 */
export const sendAuthConfirmationEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().email().max(200) }).parse(input))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMail, siteUrl, escapeHtml } = await import("./approval-mail.server");

    const redirectTo = `${siteUrl()}/dashboard`;

    // Bevorzugt den Signup-Bestätigungslink; existiert das Konto bereits
    // bestätigt, wird ein Magic-Link zum Anmelden erzeugt.
    let link: string | null = null;
    const magic = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (!magic.error) link = magic.data?.properties?.action_link ?? null;

    if (!link) {
      // Kein Konto vorhanden – aus Datenschutzgründen identische Antwort.
      return { sent: true as const };
    }

    const subject = "Ihr Bestätigungslink für GebCalc";
    const text = `Bitte bestätigen Sie Ihre E-Mail-Adresse und melden Sie sich an:\n\n${link}\n\nDer Link ist aus Sicherheitsgründen nur begrenzt gültig.`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">
      <h2 style="margin:0 0 12px">E-Mail-Adresse bestätigen</h2>
      <p>Bitte bestätigen Sie die Adresse <strong>${escapeHtml(email)}</strong> und melden Sie sich bei GebCalc an.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#0369a1;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Jetzt bestätigen &amp; anmelden</a></p>
      <p style="color:#64748b;font-size:13px">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>${escapeHtml(link)}</p>
      <p style="margin-top:28px;color:#64748b;font-size:12px">GebCalc</p>
    </div>`;

    await sendMail({ to: email, subject, html, text });
    return { sent: true as const };
  });
