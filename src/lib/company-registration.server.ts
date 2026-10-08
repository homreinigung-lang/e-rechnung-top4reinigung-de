import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Registration = {
  fullName?: string;
  companyName?: string;
  employeeCount?: number;
  legalForm?: string;
};

/** Only the authenticated identity can register; administrator bans stay intact. */
export async function completeCompanyRegistration(userId: string, input: Registration) {
  const auth = await supabaseAdmin.auth.admin.getUserById(userId);
  if (auth.error || !auth.data.user) throw new Error("Bitte erneut anmelden.");
  const user = auth.data.user;
  const existing = await supabaseAdmin
    .from("account_approvals")
    .select("id,status,full_name,company_name")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && ["blocked", "rejected"].includes(existing.data.status)) {
    return { status: existing.data.status };
  }

  // A matching email alone does not prove an employee relationship.
  const employee = await supabaseAdmin
    .from("employees")
    .select("id")
    .eq("auth_user_id", userId)
    .limit(1);
  if (employee.error) throw employee.error;
  if (employee.data?.length) return { status: "approved" };

  const settings = await supabaseAdmin
    .from("company_settings")
    .select("id,company_name,owner_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings.error) throw settings.error;
  const details = z
    .object({
      email: z.string().email().max(200),
      fullName: z.string().trim().min(1, "Bitte Ihren vollständigen Namen eingeben.").max(200),
      companyName: z.string().trim().min(1, "Bitte den Firmennamen eingeben.").max(200),
    })
    .parse({
      email: user.email,
      fullName: input.fullName?.trim() || settings.data?.owner_name || existing.data?.full_name,
      companyName:
        input.companyName?.trim() || settings.data?.company_name || existing.data?.company_name,
    });
  if (!settings.data) {
    const saved = await supabaseAdmin.from("company_settings").insert({
      user_id: userId,
      company_name: details.companyName,
      owner_name: details.fullName,
      email: details.email,
      employee_count: input.employeeCount ?? 0,
      legal_form: input.legalForm?.trim() ?? "",
    });
    if (saved.error) throw saved.error;
  }
  const subscription = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (subscription.error) throw subscription.error;
  const now = new Date();
  if (!subscription.data) {
    const saved = await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      company_name: details.companyName,
      city: "",
      contact_email: details.email,
      plan: "basis",
      status: "trial",
      visible_on_landing: false,
      note: "Automatische Testphase über 60 Tage",
      started_on: now.toISOString().slice(0, 10),
      renews_on: new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10),
    });
    if (saved.error) throw saved.error;
  }
  // Save acceptance last. Retrying after a failed write does not restart an existing trial.
  if (!existing.data) {
    const saved = await supabaseAdmin.from("account_approvals").insert({
      auth_user_id: userId,
      email: details.email,
      full_name: details.fullName,
      company_name: details.companyName,
      status: "approved",
      decided_at: now.toISOString(),
      token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    });
    if (saved.error) throw saved.error;
  } else if (existing.data.status === "pending") {
    const saved = await supabaseAdmin
      .from("account_approvals")
      .update({ status: "approved", decided_at: now.toISOString() })
      .eq("id", existing.data.id)
      .eq("status", "pending")
      .select("status")
      .maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) throw new Error("Kontostatus wurde geändert. Bitte erneut anmelden.");
  }
  return { status: "approved" };
}
