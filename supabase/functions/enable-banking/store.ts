import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  BankError,
  type BankSession,
  type BankStore,
  type BankTransaction,
  type StoredConnection,
} from "./core.ts";

export function createBankStore(): BankStore {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !key || !anon) throw new Error("Missing server configuration");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let actor: ReturnType<typeof createClient> | undefined;
  const checked = <T>(result: { data: T; error: unknown }) => {
    if (result.error) throw new Error("Bank database operation failed");
    return result.data;
  };
  return {
    async authenticate(request) {
      const authorization = request.headers.get("Authorization") ?? "";
      if (!authorization.startsWith("Bearer ")) throw new BankError("Nicht angemeldet.", 401);
      actor = createClient(url, anon, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await actor.auth.getUser();
      if (error || !data.user) throw new BankError("Ungültige Benutzer-Sitzung.", 401);
      const access = await actor.rpc("enable_banking_access");
      if (access.error || access.data !== true)
        throw new BankError("Der Kontozugriff ist gesperrt.", 403);
      return data.user.id;
    },
    async connection(userId) {
      if (!actor) throw new BankError("Nicht angemeldet.", 401);
      return checked(
        await actor
          .from("bank_connections")
          .select("id,requisition_id,account_ids")
          .eq("user_id", userId)
          .eq("provider", "enable_banking")
          .eq("status", "connected")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ) as StoredConnection | null;
    },
    async saveState(userId, stateHash, psuHash, expiresAt) {
      checked(
        await admin
          .from("enable_banking_auth_states")
          .delete()
          .lt("expires_at", new Date().toISOString()),
      );
      checked(
        await admin
          .from("enable_banking_auth_states")
          .insert({
            user_id: userId,
            state_hash: stateHash,
            psu_hash: psuHash,
            expires_at: expiresAt,
          }),
      );
    },
    async consumeState(userId, stateHash, now) {
      const data = checked(
        await admin
          .from("enable_banking_auth_states")
          .update({ consumed_at: now })
          .eq("user_id", userId)
          .eq("state_hash", stateHash)
          .is("consumed_at", null)
          .gt("expires_at", now)
          .select("psu_hash")
          .maybeSingle(),
      );
      return data?.psu_hash ?? null;
    },
    async attach(userId: string, session: BankSession) {
      checked(await admin.rpc("enable_banking_attach", { _user_id: userId, _session: session }));
    },
    async disconnect(userId, sessionId) {
      return (
        checked(
          await admin.rpc("enable_banking_disconnect", {
            _user_id: userId,
            _session_id: sessionId,
          }),
        ) === true
      );
    },
    async reconcile(
      userId: string,
      connection: StoredConnection,
      accountId: string,
      accountHash: string,
      tx: BankTransaction,
    ) {
      return checked(
        await admin.rpc("enable_banking_reconcile", {
          _user_id: userId,
          _connection_id: connection.id,
          _session_id: connection.requisition_id,
          _account_id: accountId,
          _account_hash: accountHash,
          _tx: tx,
        }),
      ) as string | null;
    },
  };
}
