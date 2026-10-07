import type { SupabaseClient } from "@supabase/supabase-js";

/** Company AI tools are unavailable to employees and blocked/deleted accounts. */
export async function consumeCompanyAiQuota(db: SupabaseClient, userId: string) {
  const access = await db.rpc("get_account_access_status");
  if (access.error || typeof access.data !== "string")
    throw new Error("Kontostatus konnte nicht geprüft werden. Bitte erneut versuchen.");
  if (["blocked", "rejected"].includes(access.data))
    throw new Error("Dieses Firmenkonto ist gesperrt.");

  const role = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (role.error) throw new Error("Berechtigung konnte nicht geprüft werden.");
  if (role.data?.role !== "admin") {
    const employee = await db
      .from("employees")
      .select("id")
      .eq("auth_user_id", userId)
      .neq("user_id", userId)
      .limit(1);
    if (employee.error) throw new Error("Mitarbeiterzugang konnte nicht geprüft werden.");
    if (employee.data?.length)
      throw new Error("Diese KI-Funktion ist nur für die Firmenverwaltung verfügbar.");
    const company = await db
      .from("company_settings")
      .select("company_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (company.error || !company.data?.company_name?.trim())
      throw new Error("Bitte zuerst die Firmenregistrierung abschließen.");
  }

  // All company AI tools share the existing atomic rolling quota (8/min, 80/day).
  const quota = await db.from("assistant_requests").insert({ user_id: userId });
  if (quota.error)
    throw new Error(
      quota.error.message.includes("KI-Limit")
        ? quota.error.message
        : "KI-Zugriff nicht möglich. Bitte Anmeldung und Kontostatus prüfen.",
    );
}
