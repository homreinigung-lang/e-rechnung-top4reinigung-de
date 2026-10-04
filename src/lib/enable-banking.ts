import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export { transactionAmount, transactionDate } from "../../supabase/functions/enable-banking/core";
export type { BankTransaction } from "../../supabase/functions/enable-banking/core";

export const BANK_QUERY_KEY = ["enable-banking-connection"] as const;
export const BANK_SESSION_KEY = "enable_banking_session";
export const BANK_STATE_KEY = "enable_banking_state";
export type EnableSession = {
  session_id: string;
  accounts?: Array<{
    uid?: string;
    account_id?: { iban?: string };
    iban?: string;
    name?: string;
    currency?: string;
  }>;
  aspsp?: { name?: string; country?: string };
};
export async function enableBanking<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { ...body, protocol: 2 },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
export async function loadSharedSession(): Promise<EnableSession | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("bank_connections")
    .select("requisition_id,institution_name,institution_id,account_ids")
    .eq("user_id", auth.user.id)
    .eq("provider", "enable_banking")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.requisition_id
    ? {
        session_id: data.requisition_id,
        accounts: (data.account_ids ?? []).map((uid) => ({ uid })),
        aspsp: { name: data.institution_name, country: data.institution_id },
      }
    : null;
}
export function validBankState(expected: string | null, returned: string | null) {
  return Boolean(expected && returned && expected === returned);
}
export function useEnableBankingConnection() {
  const client = useQueryClient();
  const attempted = useRef(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: BANK_QUERY_KEY,
    queryFn: loadSharedSession,
    refetchInterval: 30000,
    retry: 1,
  });
  useEffect(() => {
    if (attempted.current || !query.isSuccess) return;
    attempted.current = true;
    let sid: string | undefined;
    try {
      const raw = localStorage.getItem(BANK_SESSION_KEY);
      if (!raw) return;
      sid = (JSON.parse(raw) as EnableSession)?.session_id;
      if (!sid) throw new Error("Ungültige Bankverbindung. Bitte erneut verbinden.");
    } catch (error) {
      setMigrationError(
        error instanceof Error ? error.message : "Bitte das Bankkonto erneut verbinden.",
      );
      return;
    }
    let active = true;
    void enableBanking<EnableSession>({ action: "migrate_session", session_id: sid })
      .then(async () => {
        localStorage.removeItem(BANK_SESSION_KEY);
        if (active) await client.invalidateQueries({ queryKey: BANK_QUERY_KEY });
      })
      .catch(() => {
        if (active)
          setMigrationError(
            "Die alte Bankverbindung konnte nicht sicher übernommen werden. Bitte erneut verbinden.",
          );
      });
    return () => {
      active = false;
    };
  }, [client, query.isSuccess]);
  return { ...query, migrationError };
}
