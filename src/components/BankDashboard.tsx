import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "enable_banking_session";
const SHARED_PROVIDER = "enable_banking";

type EnableAccount = {
  uid: string;
  name?: string;
  iban?: string;
};

type EnableBank = {
  name?: string;
  country?: string;
};

type EnableSession = {
  session_id: string;
  accounts?: EnableAccount[];
  aspsp?: EnableBank;
};

type EnableTransaction = {
  transaction_id?: string;
  entry_reference?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string | number; currency?: string };
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[] | string;
  reference_number?: string;
};

type EnableBalances = {
  balances?: Array<{
    balance_amount?: { amount?: string | number; currency?: string };
    balance_type?: string;
  }>;
};

type Invoice = {
  id: string;
  type: string;
  status: string;
  number: string;
  total: number | string;
  customer_name?: string | null;
  customer_company?: string | null;
};

function parseLocalSession(): EnableSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnableSession;
    return parsed?.session_id ? parsed : null;
  } catch {
    return null;
  }
}

function transactionDate(tx: EnableTransaction) {
  return tx.booking_date ?? tx.value_date ?? "";
}

function transactionText(tx: EnableTransaction) {
  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.join(" ")
    : tx.remittance_information ?? "";
  return [tx.debtor?.name, tx.creditor?.name, remittance, tx.reference_number, tx.entry_reference]
    .filter(Boolean)
    .join(" ");
}

function normalized(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function loadSharedEnableSession(): Promise<EnableSession | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("bank_connections")
    .select("requisition_id, institution_name, institution_id, account_ids")
    .eq("user_id", user.id)
    .eq("provider", SHARED_PROVIDER)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.requisition_id) return null;

  return {
    session_id: data.requisition_id,
    accounts: (data.account_ids ?? []).map((uid) => ({ uid })),
    aspsp: {
      name: data.institution_name || undefined,
      country: data.institution_id || undefined,
    },
  };
}

async function persistSharedSession(session: EnableSession) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user || !session.session_id) throw new Error("Keine angemeldete Benutzer-Sitzung.");

  const accountIds = (session.accounts ?? []).map((item) => item.uid).filter(Boolean);
  if (accountIds.length === 0) throw new Error("Die Bankverbindung enthält kein Konto.");
  const now = new Date().toISOString();

  const { data: existing, error: findError } = await supabase
    .from("bank_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", SHARED_PROVIDER)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  const payload = {
    provider: SHARED_PROVIDER,
    requisition_id: session.session_id,
    agreement_id: "",
    institution_id: session.aspsp?.country ?? "",
    institution_name: session.aspsp?.name ?? "",
    account_ids: accountIds,
    status: "connected",
    last_sync_at: now,
    user_id: user.id,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("bank_connections")
      .update(payload)
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("bank_connections").insert(payload);
    if (error) throw error;
  }
}

async function invokeEnableBanking(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("enable-banking", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export function BankDashboard({ docs }: { docs: Invoice[] }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<EnableSession | null>(null);
  const [balances, setBalances] = useState<EnableBalances | null>(null);
  const [transactions, setTransactions] = useState<EnableTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const migratedLocalSessionRef = useRef(false);
  const appliedSharedSessionRef = useRef(false);

  const sharedSessionQuery = useQuery({
    queryKey: ["enable-banking-connection"],
    queryFn: loadSharedEnableSession,
  });

  useEffect(() => {
    if (migratedLocalSessionRef.current) return;
    migratedLocalSessionRef.current = true;

    const local = parseLocalSession();
    if (!local) return;

    persistSharedSession(local)
      .then(async () => {
        setSession(local);
        localStorage.removeItem(SESSION_KEY);
        await queryClient.invalidateQueries({ queryKey: ["enable-banking-connection"] });
      })
      .catch((error) => {
        console.error("Enable Banking Migration fehlgeschlagen:", error);
        setMessage("Die vorhandene Bankverbindung konnte nicht sicher übernommen werden.");
      });
  }, [queryClient]);

  useEffect(() => {
    if (session || appliedSharedSessionRef.current) return;
    if (!sharedSessionQuery.data) return;
    appliedSharedSessionRef.current = true;
    setSession(sharedSessionQuery.data);
  }, [session, sharedSessionQuery.data]);

  const account = useMemo(() => session?.accounts?.find((item) => item.uid), [session]);

  const reconcileInvoices = useCallback(
    async (rows: EnableTransaction[]) => {
      const openInvoices = docs.filter(
        (doc) => doc.type === "invoice" && !["paid", "cancelled"].includes(String(doc.status ?? "")),
      );
      let changed = false;

      for (const tx of rows) {
        const amount = Number(tx.transaction_amount?.amount ?? 0);
        if (!(amount > 0)) continue;

        const text = normalized(transactionText(tx));
        if (!text) continue;

        const exactNumberMatches = openInvoices.filter((invoice) => {
          const invoiceNo = normalized(invoice.number);
          const total = Number(invoice.total ?? 0);
          return invoiceNo && text.includes(invoiceNo) && Math.abs(total - amount) < 0.01;
        });

        let match: Invoice | undefined;
        if (exactNumberMatches.length === 1) {
          match = exactNumberMatches[0];
        } else {
          const nameAmountMatches = openInvoices.filter((invoice) => {
            const total = Number(invoice.total ?? 0);
            const customerName = normalized(invoice.customer_name);
            const customerCompany = normalized(invoice.customer_company);
            const hasName =
              (customerName && text.includes(customerName)) ||
              (customerCompany && text.includes(customerCompany));
            return hasName && Math.abs(total - amount) < 0.01;
          });
          if (nameAmountMatches.length === 1) match = nameAmountMatches[0];
        }

        if (match) {
          const { error } = await supabase.from("documents").update({ status: "paid" }).eq("id", match.id);
          if (error) throw error;
          changed = true;
        }
      }

      if (changed) await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    [docs, queryClient],
  );

  const refresh = useCallback(async () => {
    if (!account?.uid || !session) return;
    setLoading(true);
    setMessage(null);
    try {
      const [balanceResult, txResult] = await Promise.all([
        invokeEnableBanking("balances", { account_id: account.uid }),
        invokeEnableBanking("transactions", { account_id: account.uid }),
      ]);

      const newestFirst: EnableTransaction[] = [...(txResult?.transactions ?? [])].sort((a, b) =>
        transactionDate(b).localeCompare(transactionDate(a)),
      );

      setBalances(balanceResult ?? null);
      setTransactions(newestFirst.slice(0, 10));
      await reconcileInvoices(newestFirst);
      setLastRefresh(new Date().toISOString());

      persistSharedSession(session)
        .then(() => queryClient.invalidateQueries({ queryKey: ["enable-banking-connection"] }))
        .catch((error) => console.error("Enable Banking Sync fehlgeschlagen:", error));
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Bankdaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [account?.uid, session, reconcileInvoices, queryClient]);

  useEffect(() => {
    if (account?.uid) void refresh();
  }, [account?.uid, refresh]);

  const balance = balances?.balances?.[0]?.balance_amount;

  if (sharedSessionQuery.isLoading && !session) {
    return <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Bankverbindung wird geladen …</div>;
  }

  if (!session || !account?.uid) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Bankkonto</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinden Sie das Bankkonto einmal unter Bankverbindung. Danach gilt die Verbindung auf allen Geräten Ihres Kontos.
        </p>
        {message && <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">{message}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{session.aspsp?.name || "Bankkonto"}</h3>
          <p className="text-sm text-muted-foreground">{account.iban || account.name || "Konto verbunden"}</p>
          {lastRefresh && (
            <p className="mt-1 text-xs text-muted-foreground">
              Letzter Abruf: {new Date(lastRefresh).toLocaleString("de-DE")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Aktualisiere …" : "Aktualisieren"}
        </button>
      </div>

      {message && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">{message}</div>}

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Kontostand</div>
        <div className="mt-1 text-2xl font-semibold">
          {balance?.amount != null
            ? Number(balance.amount).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "–"}{" "}
          {balance?.currency ?? "EUR"}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="font-medium">Letzte Bankumsätze</h4>
          <span className="text-xs text-muted-foreground">Neueste zuerst · letzte {transactions.length} Umsätze</span>
        </div>
        <div className="divide-y rounded-lg border">
          {transactions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Keine Umsätze gefunden.</div>
          ) : (
            transactions.map((tx, index) => {
              const amount = Number(tx.transaction_amount?.amount ?? 0);
              return (
                <div key={tx.transaction_id ?? tx.entry_reference ?? index} className="flex items-start justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {tx.debtor?.name || tx.creditor?.name || transactionText(tx) || "Bankumsatz"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {transactionDate(tx) ? new Date(`${transactionDate(tx)}T00:00:00`).toLocaleDateString("de-DE") : "–"}
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-sm font-semibold">
                    {amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    {tx.transaction_amount?.currency ?? "EUR"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default BankDashboard;
