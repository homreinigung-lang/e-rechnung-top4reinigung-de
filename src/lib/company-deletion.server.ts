import type { SupabaseClient } from "@supabase/supabase-js";

/** Keep the account blocked if Auth deletion or subsequent cleanup fails. */
export async function deleteCompanySafely(
  caller: SupabaseClient,
  admin: SupabaseClient,
  approvalId: string,
) {
  // The RPC verifies the administrator, locks the row and prevents reactivation
  // while Auth is being deleted. It does not delete any application data.
  const prepared = await caller.rpc("prepare_company_account_deletion", {
    _approval_id: approvalId,
  });
  if (prepared.error) throw new Error(prepared.error.message);
  const userId = prepared.data;
  if (typeof userId !== "string" || !userId) throw new Error("Konto nicht gefunden.");

  // A previous attempt may already have deleted Auth but failed during cleanup.
  const existing = await admin.auth.admin.getUserById(userId);
  if (existing.error && existing.error.code !== "user_not_found")
    throw new Error(existing.error.message);
  if (!existing.data.user && existing.error?.code !== "user_not_found")
    throw new Error("Kontolöschung konnte nicht sicher geprüft werden. Das Konto bleibt gesperrt.");
  if (existing.data.user) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error(deleted.error.message);
  }

  const subscription = await admin.from("subscriptions").delete().eq("user_id", userId);
  if (subscription.error) throw new Error(subscription.error.message);
  const approval = await admin.from("account_approvals").delete().eq("id", approvalId);
  if (approval.error) throw new Error(approval.error.message);
  return { deleted: true };
}
