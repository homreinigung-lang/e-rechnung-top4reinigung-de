/**
 * Gemeinsame Drosselung für öffentlich auslösbare E-Mails
 * (Registrierung, Passwort-Wiederherstellung) gegen Mail-Bombing.
 */

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ThrottleOptions = {
  email: string;
  limitPerEmail?: number;
  windowEmailMinutes?: number;
  limitPerIp?: number;
  windowIpMinutes?: number;
};

/**
 * Prüft und protokolliert einen Versandversuch.
 * Rückgabe `false` = Grenze erreicht, es darf nicht gesendet werden.
 */
export async function allowPublicMail(options: ThrottleOptions): Promise<boolean> {
  const {
    email,
    limitPerEmail = 3,
    windowEmailMinutes = 15,
    limitPerIp = 20,
    windowIpMinutes = 60,
  } = options;

  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Cloudflare sets this header at the edge; X-Forwarded-For is spoofable.
  const ipRaw = getRequestHeader("cf-connecting-ip")?.trim() ?? "";
  const emailHash = await sha256Hex(`email:${email.trim().toLowerCase()}`);
  const ipHash = ipRaw ? await sha256Hex(`ip:${ipRaw}`) : "";

  const { data, error } = await supabaseAdmin.rpc("consume_mail_budget", {
    _email_hash: emailHash,
    _ip_hash: ipHash,
    _email_limit: limitPerEmail,
    _email_minutes: windowEmailMinutes,
    _ip_limit: limitPerIp,
    _ip_minutes: windowIpMinutes,
  });
  // Database failure must never disable the limit and permit a message.
  if (error || data !== true) return false;

  // Alte Einträge aufräumen, damit die Tabelle klein bleibt.
  await supabaseAdmin
    .from("auth_mail_throttle")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60000).toISOString());

  return true;
}
