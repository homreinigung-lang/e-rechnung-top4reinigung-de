import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BANK_QUERY_KEY,
  enableBanking,
  transactionAmount,
  transactionDate,
  useEnableBankingConnection,
  type BankTransaction,
} from "@/lib/enable-banking";

type EnableBalances = {
  balances?: Array<{
    balance_amount?: { amount?: string | number; currency?: string };
    balance_type?: string;
  }>;
};
function transactionText(tx: BankTransaction) {
  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.join(" ")
    : (tx.remittance_information ?? "");
  return [tx.debtor?.name, tx.creditor?.name, remittance, tx.reference_number]
    .filter(Boolean)
    .join(" ");
}
export function BankDashboard({ docs: _docs }: { docs: unknown[] }) {
  const queryClient = useQueryClient();
  const sharedSessionQuery = useEnableBankingConnection();
  const session = sharedSessionQuery.data ?? null;
  const account = session?.accounts?.find((item) => item.uid);
  const [balances, setBalances] = useState<EnableBalances | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!account?.uid || !session || inFlight.current) return;
    const current = ++generation.current;
    inFlight.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const [balanceResult, txResults] = await Promise.all([
        enableBanking<EnableBalances>({ action: "balances", account_id: account.uid }),
        Promise.all(
          (session.accounts ?? [])
            .filter((item) => item.uid)
            .map((item) =>
              enableBanking<{ transactions?: BankTransaction[]; reconciled?: string[] }>({
                action: "transactions",
                account_id: item.uid,
                reconcile: true,
              }),
            ),
        ),
      ]);
      if (current !== generation.current) return;
      setBalances(balanceResult ?? null);
      const newestFirst = txResults
        .flatMap((result) => result.transactions ?? [])
        .sort((a, b) => transactionDate(b).localeCompare(transactionDate(a)));
      setTransactions(newestFirst.slice(0, 10));
      if (txResults.some((result) => (result.reconciled?.length ?? 0) > 0)) {
        await Promise.all(
          ["documents", "dashboard", "kunden_documents", "euer"].map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
      }
      setLastRefresh(new Date().toISOString());
    } catch (error) {
      if (current === generation.current) {
        setMessage(
          error instanceof Error ? error.message : "Bankdaten konnten nicht geladen werden.",
        );
        await queryClient.invalidateQueries({ queryKey: BANK_QUERY_KEY });
      }
    } finally {
      if (current === generation.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [account?.uid, session, queryClient]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    ++generation.current;
    inFlight.current = false;
    setBalances(null);
    setTransactions([]);
    setLastRefresh(null);
    setLoading(false);
    if (account?.uid) void refreshRef.current();
    return () => {
      ++generation.current;
      inFlight.current = false;
    };
  }, [session?.session_id, account?.uid]);
  const balance = balances?.balances?.[0]?.balance_amount;
  const visibleMessage =
    message ??
    sharedSessionQuery.migrationError ??
    (sharedSessionQuery.error ? "Bankverbindung konnte nicht geladen werden." : null);

  if (sharedSessionQuery.isLoading && !session) {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        Bankverbindung wird geladen …
      </div>
    );
  }

  if (!session || !account?.uid) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-semibold">Bankkonto</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinden Sie das Bankkonto einmal unter Bankverbindung. Danach gilt die Verbindung auf
          allen Geräten Ihres Kontos.
        </p>
        {visibleMessage && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {visibleMessage}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-hidden rounded-xl border bg-card p-3 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{session.aspsp?.name || "Bankkonto"}</h3>
          <p className="text-sm text-muted-foreground">
            {account.iban || account.name || "Konto verbunden"}
          </p>
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

      {visibleMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {visibleMessage}
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Kontostand</div>
        <div className="mt-1 text-2xl font-semibold">
          {balance?.amount != null
            ? Number(balance.amount).toLocaleString("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "–"}{" "}
          {balance?.currency ?? "EUR"}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h4 className="font-medium">Letzte Bankumsätze</h4>
          <span className="text-xs text-muted-foreground sm:text-right">
            Neueste zuerst · letzte {transactions.length} Umsätze
          </span>
        </div>
        <div className="divide-y rounded-lg border">
          {transactions.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Keine Umsätze gefunden.</div>
          ) : (
            transactions.map((tx, index) => {
              const amount = transactionAmount(tx);
              return (
                <div
                  key={tx.transaction_id ?? tx.entry_reference ?? index}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-3"
                >
                  <div className="min-w-0">
                    <div className="line-clamp-2 break-words text-sm font-medium">
                      {tx.debtor?.name || tx.creditor?.name || transactionText(tx) || "Bankumsatz"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {transactionDate(tx)
                        ? new Date(`${transactionDate(tx)}T00:00:00`).toLocaleDateString("de-DE")
                        : "–"}
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                    {amount.toLocaleString("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
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
