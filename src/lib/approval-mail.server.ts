import { sendVerifiedEmail } from "./resend-email.server";

/**
 * E-Mail-Versand für die Konto-Freigabe (Registrierungsprüfung durch den Inhaber).
 * Nutzt denselben Resend-Gateway wie der Rechnungsversand.
 */
export const OWNER_EMAIL = "info@top4reinigung.de";

export function siteUrl() {
  return process.env["PUBLIC_SITE_URL"] || "https://e-rechnung.top4reinigung.de";
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  companyName?: string;
  companyEmail?: string;
}) {
  return sendVerifiedEmail(opts);
}

const shell = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:15px">${inner}
  <p style="margin-top:28px;color:#64748b;font-size:12px">GebCalc</p></div>`;

export function ownerRequestMail(p: {
  name: string;
  email: string;
  createdAt: string;
  approveUrl: string;
  rejectUrl: string;
}) {
  const text = `Neue Registrierung wartet auf Ihre Freigabe.

Name: ${p.name || "—"}
E-Mail: ${p.email}
Registriert am: ${p.createdAt}

Freigeben: ${p.approveUrl}
Ablehnen: ${p.rejectUrl}`;

  const html = shell(`
    <h2 style="margin:0 0 12px">Neue Registrierung wartet auf Freigabe</h2>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 16px 4px 0;color:#64748b">Name</td><td><strong>${escapeHtml(p.name) || "—"}</strong></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#64748b">E-Mail</td><td><strong>${escapeHtml(p.email)}</strong></td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#64748b">Registriert am</td><td><strong>${escapeHtml(p.createdAt)}</strong></td></tr>
    </table>
    <p style="margin:24px 0">
      <a href="${p.approveUrl}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Freigeben</a>
      &nbsp;&nbsp;
      <a href="${p.rejectUrl}" style="background:#b91c1c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Ablehnen</a>
    </p>
    <p style="color:#64748b;font-size:13px">Das Konto bleibt gesperrt, bis Sie es freigeben.</p>`);

  return { text, html };
}

export function welcomeMail(loginUrl: string) {
  const text = `Ihr Zugang wurde freigeschaltet. Sie können sich jetzt anmelden: ${loginUrl}`;
  const html = shell(`
    <h2 style="margin:0 0 12px">Willkommen bei GebCalc</h2>
    <p>Ihr Zugang wurde freigeschaltet. Sie können sich ab sofort anmelden.</p>
    <p style="margin:24px 0"><a href="${loginUrl}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Jetzt anmelden</a></p>`);
  return { text, html };
}

export function rejectionMail() {
  const text =
    "Ihre Registrierung wurde leider abgelehnt. Bei Fragen wenden Sie sich bitte an " +
    OWNER_EMAIL +
    ".";
  const html = shell(`
    <h2 style="margin:0 0 12px">Registrierung abgelehnt</h2>
    <p>Ihre Registrierung wurde leider nicht freigegeben und der Zugang wurde entfernt.</p>
    <p>Bei Fragen erreichen Sie uns unter <a href="mailto:${OWNER_EMAIL}">${OWNER_EMAIL}</a>.</p>`);
  return { text, html };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
