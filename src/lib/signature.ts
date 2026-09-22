/**
 * E-Mail-Signatur mit Logo/Bildern.
 * Die Signatur kann als einfacher Text oder als HTML (inkl. <img>) hinterlegt werden.
 */

import sanitizeHtml from "sanitize-html";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Entfernt gefährliche Inhalte (Skripte, Event-Handler) aus dem Signatur-HTML. */
export function sanitizeSignatureHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "a",
      "img",
      "table",
      "tbody",
      "tr",
      "td",
      "th",
      "ul",
      "ol",
      "li",
      "hr",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http"] },
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i, /^rgb\([\d\s,.%]+\)$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "font-style": [/^(?:normal|italic)$/],
        "text-align": [/^(?:left|right|center)$/],
        "text-decoration": [/^(?:none|underline|line-through)$/],
        "max-height": [/^\d+(?:px|pt|em)$/],
        "line-height": [/^\d+(?:\.\d+)?(?:px|pt|em|%)?$/],
        margin: [/^[\d\s.pxem%-]+$/],
        "margin-top": [/^\d+(?:px|pt|em)$/],
        padding: [/^[\d\s.pxem%]+$/],
        "padding-top": [/^\d+(?:px|pt|em)$/],
        border: [/^0$/],
        "border-top": [/^\d+px solid #[0-9a-f]{3,8}$/i],
        display: [/^(?:block|inline|inline-block)$/],
      },
    },
  });
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
  if (website)
    links.push(`<a href="${escapeHtml(website)}" style="color:#0b6bcb">${escapeHtml(website)}</a>`);
  if (facebook)
    links.push(
      `<a href="${escapeHtml(facebook)}" style="color:#0b6bcb">${escapeHtml(facebook)}</a>`,
    );
  if (links.length > 0) parts.push(`<div style="margin-top:6px">${links.join(" · ")}</div>`);

  if (parts.length === 0) return "";
  return sanitizeSignatureHtml(
    `<div style="margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;color:#111827">${parts.join("")}</div>`,
  );
}

/** Vollständiger HTML-Text der E-Mail: Nachricht + Signatur. */
export function buildEmailHtml(bodyText: string, signatureHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827">
<div>${textToHtml(bodyText)}</div>
${sanitizeSignatureHtml(signatureHtml)}
</div>`;
}
