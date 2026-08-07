/**
 * E-Mail-Signatur mit Logo/Bildern.
 * Die Signatur kann als einfacher Text oder als HTML (inkl. <img>) hinterlegt werden.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Entfernt gefährliche Inhalte (Skripte, Event-Handler) aus dem Signatur-HTML. */
export function sanitizeSignatureHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
}

/** Wandelt einfachen Text in HTML-Absätze um. */
export function textToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0b6bcb">$1</a>')
    .replace(/\n/g, "<br />");
}

export type SignatureSettings = {
  email_signature?: unknown;
  email_signature_html?: unknown;
  email_signature_logo_url?: unknown;
  website_url?: unknown;
  facebook_url?: unknown;
};

/** Baut den HTML-Block der Signatur (Logo + HTML- bzw. Text-Signatur). */
export function buildSignatureHtml(settings: SignatureSettings | null | undefined): string {
  const logo = String(settings?.email_signature_logo_url ?? "").trim();
  const html = String(settings?.email_signature_html ?? "").trim();
  const text = String(settings?.email_signature ?? "").trim();

  const parts: string[] = [];
  if (logo) {
    parts.push(
      `<div style="margin:0 0 10px"><img src="${escapeHtml(logo)}" alt="Firmenlogo" style="max-height:70px;border:0;display:block" /></div>`,
    );
  }
  if (html) parts.push(sanitizeSignatureHtml(html));
  else if (text) parts.push(`<div>${textToHtml(text)}</div>`);

  const links: string[] = [];
  const website = String(settings?.website_url ?? "").trim();
  const facebook = String(settings?.facebook_url ?? "").trim();
  if (website) links.push(`<a href="${escapeHtml(website)}" style="color:#0b6bcb">${escapeHtml(website)}</a>`);
  if (facebook) links.push(`<a href="${escapeHtml(facebook)}" style="color:#0b6bcb">${escapeHtml(facebook)}</a>`);
  if (links.length > 0) parts.push(`<div style="margin-top:6px">${links.join(" · ")}</div>`);

  if (parts.length === 0) return "";
  return `<div style="margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;color:#111827">${parts.join("")}</div>`;
}

/** Vollständiger HTML-Text der E-Mail: Nachricht + Signatur. */
export function buildEmailHtml(bodyText: string, signatureHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827">
<div>${textToHtml(bodyText)}</div>
${signatureHtml}
</div>`;
}
