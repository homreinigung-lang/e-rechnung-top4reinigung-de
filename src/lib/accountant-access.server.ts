/**
 * Prüfung des Steuerberater-Zugangs (Token + Zugangscode) inklusive Schutz
 * gegen das Durchprobieren von Codes (Brute-Force).
 *
 * Der Zugangscode wird niemals im Klartext gespeichert, sondern nur als
 * SHA-256-Prüfsumme (mit dem Zugangs-Token als Salz). Prüfung und Zähler werden
 * in einer gesperrten Datenbanktransaktion aktualisiert, damit parallele
 * Versuche die Sperre nicht umgehen. Nach mehreren Fehlversuchen wird der Zugang zeitweise gesperrt;
 * erfolgreiche Anmeldungen setzen den Zähler zurück.
 */

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

  const candidate = await hashAccessCode(token, code);
  const { data, error } = await supabaseAdmin.rpc("check_accountant_access", {
    _token: token,
    _candidate_hash: candidate,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Zugang konnte nicht geprüft werden. Bitte später erneut versuchen.");
  }
  if (data["status"] === "expired")
    throw new Error("Dieser Zugang ist abgelaufen. Bitte den Mandanten um einen neuen Zugang.");
  if (data["status"] === "locked")
    throw new Error(
      "Zu viele Fehlversuche. Der Zugang ist vorübergehend gesperrt. Bitte später erneut versuchen.",
    );
  if (
    data["status"] !== "ok" ||
    typeof data["id"] !== "string" ||
    typeof data["user_id"] !== "string"
  ) {
    throw new Error("Zugang ungültig.");
  }
  return { id: data["id"], user_id: data["user_id"] };
}
