/**
 * Prüfung des Steuerberater-Zugangs (Token + Zugangscode) inklusive Schutz
 * gegen das Durchprobieren von Codes (Brute-Force).
 *
 * Der Zugangscode wird niemals im Klartext gespeichert, sondern nur als
 * SHA-256-Prüfsumme (mit dem Zugangs-Token als Salz). Der Vergleich erfolgt
 * zeitkonstant, damit sich der Code nicht über Laufzeitunterschiede erraten
 * lässt. Nach mehreren Fehlversuchen wird der Zugang zeitweise gesperrt;
 * erfolgreiche Anmeldungen setzen den Zähler zurück.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type AccountantAccessRow = {
  id: string;
  user_id: string;
};

export function normalizeCode(value: string) {
  return (value ?? "").trim().toUpperCase();
}

/** SHA-256-Prüfsumme des Zugangscodes, mit dem Token als Salz. */
export async function hashAccessCode(token: string, code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${normalizeCode(code)}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Zeitkonstanter Vergleich zweier Prüfsummen. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = String(a ?? "");
  const y = String(b ?? "");
  const len = Math.max(x.length, y.length);
  let diff = x.length === y.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function verifyAccountantAccess(
  token: string,
  code: string,
): Promise<AccountantAccessRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: access } = await supabaseAdmin
    .from("accountant_access")
    .select(
      "id, user_id, access_code_hash, active, activated_at, failed_attempts, locked_until, expires_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (!access || !access.active) throw new Error("Zugang ungültig.");

  const expiresAt = access.expires_at ? new Date(access.expires_at as string) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new Error("Dieser Zugang ist abgelaufen. Bitte den Mandanten um einen neuen Zugang.");
  }

  const lockedUntil = access.locked_until ? new Date(access.locked_until as string) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new Error(
      "Zu viele Fehlversuche. Der Zugang ist vorübergehend gesperrt. Bitte später erneut versuchen.",
    );
  }

  const stored = String(access.access_code_hash ?? "");
  const candidate = await hashAccessCode(token, code);
  const ok = stored.length > 0 && timingSafeEqual(stored, candidate);

  if (!ok) {
    const attempts = Number(access.failed_attempts ?? 0) + 1;
    const lock =
      attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await supabaseAdmin
      .from("accountant_access")
      .update({
        failed_attempts: attempts,
        ...(lock ? { locked_until: lock } : {}),
      } as never)
      .eq("id", access.id);
    throw new Error("Zugang ungültig.");
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("accountant_access")
    .update({
      last_used_at: now,
      failed_attempts: 0,
      locked_until: null,
      ...(access.activated_at ? {} : { activated_at: now }),
    } as never)
    .eq("id", access.id);

  return { id: access.id as string, user_id: access.user_id as string };
}
