/**
 * Prüfung des Steuerberater-Zugangs (Token + Zugangscode) inklusive Schutz
 * gegen das Durchprobieren von Codes (Brute-Force).
 *
 * Nach mehreren Fehlversuchen wird der Zugang zeitweise gesperrt. Erfolgreiche
 * Anmeldungen setzen den Zähler zurück.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type AccountantAccessRow = {
  id: string;
  user_id: string;
};

function normalizeCode(value: string) {
  return (value ?? "").trim().toUpperCase();
}

export async function verifyAccountantAccess(
  token: string,
  code: string,
): Promise<AccountantAccessRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: access } = await supabaseAdmin
    .from("accountant_access")
    .select("id, user_id, access_code, active, activated_at, failed_attempts, locked_until")
    .eq("token", token)
    .maybeSingle();

  if (!access || !access.active) throw new Error("Zugang ungültig.");

  const lockedUntil = access.locked_until ? new Date(access.locked_until as string) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new Error(
      "Zu viele Fehlversuche. Der Zugang ist vorübergehend gesperrt. Bitte später erneut versuchen.",
    );
  }

  const ok = String(access.access_code ?? "").toUpperCase() === normalizeCode(code);

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
