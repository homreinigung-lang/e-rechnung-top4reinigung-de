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

  const ipRaw = (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const emailHash = await sha256Hex(`email:${email.trim().toLowerCase()}`);
  const ipHash = ipRaw ? await sha256Hex(`ip:${ipRaw}`) : "";

  const countSince = async (scope: string, keyHash: string, minutes: number) => {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    const { count } = await supabaseAdmin
      .from("auth_mail_throttle")
      .select("id", { count: "exact", head: true })
      .eq("scope", scope)
      .eq("key_hash", keyHash)
      .gte("created_at", since);
    return count ?? 0;
  };

  const tooManyForEmail = (await countSince("email", emailHash, windowEmailMinutes)) >= limitPerEmail;
  const tooManyForIp = ipHash
    ? (await countSince("ip", ipHash, windowIpMinutes)) >= limitPerIp
    : false;
  if (tooManyForEmail || tooManyForIp) return false;

  const rows = [{ scope: "email", key_hash: emailHash }];
  if (ipHash) rows.push({ scope: "ip", key_hash: ipHash });
  await supabaseAdmin.from("auth_mail_throttle").insert(rows as never);

  // Alte Einträge aufräumen, damit die Tabelle klein bleibt.
  await supabaseAdmin
    .from("auth_mail_throttle")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60000).toISOString());

  return true;
}
