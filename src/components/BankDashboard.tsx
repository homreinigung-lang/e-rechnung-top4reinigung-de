import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Landmark, RefreshCw, Settings2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { markInvoicePaid } from "@/lib/workflow";

type DashboardInvoice = {
  id: string;
  type: string;
  status: string;
  number: string;
  total: number | string;
  customer_name?: string | null;
  customer_company?: string | null;
};

type EnableAccount = {
  uid?: string;
  account_id?: { iban?: string };
  name?: string;
  currency?: string;
};

type EnableSession = {
  session_id: string;
  accounts?: EnableAccount[];
  aspsp?: { name?: string; country?: string };
};

type Balance = {
  balance_amount?: { amount?: string; currency?: string };
  balance_type?: string;
};

type Transaction = {
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[] | string;
  entry_reference?: string;
  end_to_end_id?: string;
};

const SESSION_KEY = "enable_banking_session";

async function enableBanking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("enable-banking", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function txText(tx: Transaction): string {
  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.join(" ")
    : tx.remittance_information ?? "";
  return [remittance, tx.entry_reference, tx.end_to_end_id, tx.debtor?.name, tx.creditor?.name]
    .filter(Boolean)
    .join(" ");
}

function transactionName(tx: Transaction): string {
  return tx.debtor?.name ?? tx.creditor?.name ?? "Bankumsatz";
}

function transactionInfo(tx: Transaction): string {
  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.join(" ")
    : tx.remittance_information;
  return remittance ?? tx.entry_reference ?? tx.end_to_end_id ?? tx.booking_date ?? "";
}

function incomingAmount(tx: Transaction): number {
  const value = Number(tx.transaction_amount?.amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function cents(value: number | string): number {
  return Math.round(Number(value || 0) * 100);
}

function findInvoiceMatch(tx: Transaction, invoices: DashboardInvoice[]): DashboardInvoice | null {
  const amount = incomingAmount(tx);
  if (amount <= 0) return null;

  const text = normalize(txText(tx));
  const amountCents = cents(amount);

  // Höchste Sicherheit: Rechnungsnummer steht im Verwendungszweck/Referenzfeld
  // und der Betrag entspricht der offenen Rechnung.
  const byReference = invoices.filter((invoice) => {
    const number = normalize(invoice.number);
    return number.length >= 4 && text.includes(number) && cents(invoice.total) === amountCents;
  });
  if (byReference.length === 1) return byReference[0]!;

  // Zweite sichere Variante: exakt ein offener Beleg mit diesem Betrag und
  // der Kundenname/Firmenname ist im Zahlungstext oder Kontoinhaber enthalten.
  const byAmountAndName = invoices.filter((invoice) => {
    if (cents(invoice.total) !== amountCents) return false;
    const names = [invoice.customer_company, invoice.customer_name]
      .map(normalize)
      .filter((name) => name.length >= 4);
    return names.some((name) => text.includes(name));
  });
  return byAmountAndName.length === 1 ? byAmountAndName[0]! : null;
}

export function BankDashboard({ docs }: { docs: DashboardInvoice[] }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<EnableSession | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState(0);
  const autoMatchRunning = useRef(false);

  const openInvoices = useMemo(
    () =>
      docs.filter(
        (doc) =>
          doc.type === "invoice" &&
          doc.status !== "paid" &&
          doc.status !== "cancelled" &&
          doc.status !== "draft",
      ),
    [docs],
  );

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return;
    try {
      setSession(JSON.parse(stored) as EnableSession);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const account = session?.accounts?.find((item) => item.uid) ?? session?.accounts?.[0];

  const reconcilePayments = useCallback(
    async (rows: Transaction[]) => {
      if (autoMatchRunning.current || openInvoices.length === 0) return;
      autoMatchRunning.current = true;
      try {
        const usedInvoices = new Set<string>();
        let count = 0;
        for (const tx of rows) {
          const candidates = openInvoices.filter((invoice) => !usedInvoices.has(invoice.id));
          const invoice = findInvoiceMatch(tx, candidates);
          if (!invoice) continue;
          const paidDate = tx.booking_date ?? tx.value_date;
          await markInvoicePaid(invoice.id, paidDate && paidDate.length === 10 ? paidDate : undefined);
          usedInvoices.add(invoice.id);
          count += 1;
        }
        if (count > 0) {
          setMatched(count);
          await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
          toast.success(`${count} Zahlung${count === 1 ? "" : "en"} automatisch zugeordnet.`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Zahlungsabgleich fehlgeschlagen");
      } finally {
        autoMatchRunning.current = false;
      }
    },
    [openInvoices, queryClient],
  );

  const refresh = useCallback(async () => {
    if (!account?.uid) return;
    setBusy(true);
    try {
      const [balanceResult, txResult] = await Promise.all([
        enableBanking<{ balances?: Balance[] }>({ action: "balances", account_id: account.uid }),
        enableBanking<{ transactions?: Transaction[] }>({ action: "transactions", account_id: account.uid }),
      ]);
      const nextTransactions = txResult.transactions ?? [];
      setBalances(balanceResult.balances ?? []);
      setTransactions(nextTransactions.slice(0, 12));
      await reconcilePayments(nextTransactions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bankdaten konnten nicht geladen werden");
    } finally {
      setBusy(false);
    }
  }, [account?.uid, reconcilePayments]);

  useEffect(() => {
    if (account?.uid) void refresh();
  }, [account?.uid, refresh]);

  if (!session || !account?.uid) {
    return (
      <section aria-label="Bank-Dashboard" className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="size-5 text-primary" />
              <h2 className="text-xl font-semibold">Bank-Dashboard</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Bankkonto verbinden, damit Kontostand, Umsätze und automatische Zahlungszuordnung hier erscheinen.
            </p>
          </div>
          <Button asChild>
            <Link to="/bankverbindung">
              <Settings2 className="size-4" /> Bankverbindung einrichten
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  const primaryBalance = balances.find((b) => b.balance_type === "CLBD") ?? balances[0];

  return (
    <section aria-label="Bank-Dashboard" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">Bank-Dashboard</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.aspsp?.name ?? "Verbundenes Bankkonto"} · {account.account_id?.iban ?? account.name ?? "Konto verbunden"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Aktualisieren
          </Button>
          <Button asChild variant="secondary">
            <Link to="/bankverbindung">
              <Settings2 className="size-4" /> Bankverbindung
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Kontostand</div>
          <div className="mt-2 font-display text-2xl font-semibold">
            {primaryBalance ? formatMoney(Number(primaryBalance.balance_amount?.amount ?? 0)) : "–"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {primaryBalance?.balance_type ?? "Aktueller Saldo"}
          </div>
        </div>
        <div className="surface p-5">
          <div className="text-sm text-muted-foreground">Offene Rechnungen</div>
          <div className="mt-2 font-display text-2xl font-semibold">{openInvoices.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">werden beim Bankabruf automatisch geprüft</div>
        </div>
        <div className="surface p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <WandSparkles className="size-4 text-primary" /> Automatisch zugeordnet
          </div>
          <div className="mt-2 font-display text-2xl font-semibold">{matched}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            nur bei eindeutiger Rechnungsnummer oder Betrag + Kunde
          </div>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Letzte Bankumsätze</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Zahlungseingänge werden automatisch mit offenen Rechnungen abgeglichen.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{transactions.length} angezeigt</span>
        </div>
        {transactions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Noch keine Umsätze geladen.</p>
        ) : (
          <ul className="divide-y">
            {transactions.map((tx, index) => {
              const amount = incomingAmount(tx);
              return (
                <li key={`${tx.booking_date ?? "tx"}-${tx.entry_reference ?? index}`} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {amount >= 0 ? (
                        <ArrowDownLeft className="size-4 shrink-0 text-primary" />
                      ) : (
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-sm font-medium">{transactionName(tx)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[tx.booking_date, transactionInfo(tx)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap text-sm font-semibold ${amount >= 0 ? "text-primary" : ""}`}>
                    {formatMoney(amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
