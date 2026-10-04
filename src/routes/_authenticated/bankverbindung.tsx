import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Landmark, RefreshCw, ShieldCheck, Unplug } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/bankverbindung")({
  component: BankverbindungPage,
});

type BankForm = {
  bank_name: string;
  iban: string;
  bic: string;
  owner_name: string;
};

type EnableBank = { name: string; country: string };
type EnableAccount = { uid?: string; account_id?: { iban?: string }; name?: string; currency?: string };
type EnableSession = { session_id: string; accounts?: EnableAccount[]; aspsp?: EnableBank };
type Balance = { balance_amount?: { amount?: string; currency?: string }; balance_type?: string };
type Transaction = {
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { amount?: string; currency?: string };
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[] | string;
};

const SESSION_KEY = "enable_banking_session";
const STATE_KEY = "enable_banking_state";
const SHARED_PROVIDER = "enable_banking";

const COUNTRY_OPTIONS = [
  { code: "DE", label: "Deutschland" },
  { code: "AT", label: "Österreich" },
  { code: "CH", label: "Schweiz" },
  { code: "FR", label: "Frankreich" },
  { code: "LU", label: "Luxemburg" },
  { code: "BE", label: "Belgien" },
  { code: "NL", label: "Niederlande" },
  { code: "IT", label: "Italien" },
  { code: "ES", label: "Spanien" },
  { code: "PT", label: "Portugal" },
  { code: "IE", label: "Irland" },
  { code: "GB", label: "Vereinigtes Königreich" },
  { code: "PL", label: "Polen" },
  { code: "CZ", label: "Tschechien" },
  { code: "DK", label: "Dänemark" },
  { code: "SE", label: "Schweden" },
  { code: "NO", label: "Norwegen" },
  { code: "FI", label: "Finnland" },
].sort((a, b) => a.label.localeCompare(b.label, "de"));

async function enableBanking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("enable-banking", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

async function loadSharedSession(): Promise<EnableSession | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("bank_connections")
    .select("requisition_id, institution_name, institution_id, account_ids")
    .eq("user_id", auth.user.id)
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
    } as EnableBank,
  };
}

async function persistSharedSession(session: EnableSession) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Keine angemeldete Benutzer-Sitzung.");

  const accountIds = (session.accounts ?? []).map((item) => item.uid).filter((uid): uid is string => Boolean(uid));
  if (!session.session_id || accountIds.length === 0) throw new Error("Unvollständige Bankverbindung.");

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
    last_sync_at: new Date().toISOString(),
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

function transactionDate(tx: Transaction) {
  return tx.booking_date ?? tx.value_date ?? "";
}

function formatMoney(amount?: string, currency = "EUR") {
  const value = Number(amount ?? 0);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value)
    : `${amount ?? "–"} ${currency}`;
}

function BankverbindungPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BankForm>({ bank_name: "", iban: "", bic: "", owner_name: "" });
  const [selectedCountry, setSelectedCountry] = useState("DE");
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState("");
  const [session, setSession] = useState<EnableSession | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankBusy, setBankBusy] = useState(false);
  const migratedLocalRef = useRef(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sharedSessionQuery = useQuery({
    queryKey: ["enable-banking-connection"],
    queryFn: loadSharedSession,
  });

  const { data: appInfo } = useQuery({
    queryKey: ["enable-banking-application"],
    queryFn: () => enableBanking<{ environment?: string; active?: boolean }>({ action: "application" }),
    retry: false,
  });

  const { data: bankData, isLoading: banksLoading } = useQuery({
    queryKey: ["enable-banking-banks", selectedCountry],
    queryFn: () => enableBanking<{ aspsps?: EnableBank[] }>({ action: "list_banks", country: selectedCountry }),
    retry: false,
  });

  const banks = useMemo(
    () => [...(bankData?.aspsps ?? [])].sort((a, b) => a.name.localeCompare(b.name, "de")),
    [bankData],
  );

  const filteredBanks = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase("de");
    if (!query) return banks;
    return banks.filter((bank) => bank.name.toLocaleLowerCase("de").includes(query));
  }, [banks, bankSearch]);

  useEffect(() => {
    setSelectedBank("");
    setBankSearch("");
  }, [selectedCountry]);

  useEffect(() => {
    if (!settings) return;
    setForm({
      bank_name: settings.bank_name ?? "",
      iban: settings.iban ?? "",
      bic: settings.bic ?? "",
      owner_name: settings.owner_name ?? "",
    });
  }, [settings]);

  useEffect(() => {
    if (migratedLocalRef.current) return;
    migratedLocalRef.current = true;

    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as EnableSession;
      if (!parsed?.session_id) throw new Error("Ungültige Bank-Sitzung");
      setBankBusy(true);
      persistSharedSession(parsed)
        .then(async () => {
          localStorage.removeItem(SESSION_KEY);
          setSession(parsed);
          await queryClient.invalidateQueries({ queryKey: ["enable-banking-connection"] });
        })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Bankverbindung konnte nicht übernommen werden"))
        .finally(() => setBankBusy(false));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!session && sharedSessionQuery.data) setSession(sharedSessionQuery.data);
  }, [session, sharedSessionQuery.data]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const bankError = url.searchParams.get("error");

    if (bankError) {
      toast.error(url.searchParams.get("error_description") ?? "Bankfreigabe wurde abgebrochen.");
      window.history.replaceState({}, "", "/bankverbindung");
      return;
    }
    if (!code) return;

    const expectedState = localStorage.getItem(STATE_KEY);
    if (expectedState && state && expectedState !== state) {
      toast.error("Die Bankfreigabe konnte nicht bestätigt werden.");
      window.history.replaceState({}, "", "/bankverbindung");
      return;
    }

    setBankBusy(true);
    enableBanking<EnableSession>({ action: "exchange_code", code })
      .then(async (result) => {
        await persistSharedSession(result);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(STATE_KEY);
        setSession(result);
        await queryClient.invalidateQueries({ queryKey: ["enable-banking-connection"] });
        toast.success("Bankkonto verbunden");
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Bankverbindung fehlgeschlagen"))
      .finally(() => {
        setBankBusy(false);
        window.history.replaceState({}, "", "/bankverbindung");
      });
  }, [queryClient]);

  const account = session?.accounts?.find((item) => item.uid);

  const refreshBank = async () => {
    if (!account?.uid) return;
    setBankBusy(true);
    try {
      const [balanceResult, txResult] = await Promise.all([
        enableBanking<{ balances?: Balance[] }>({ action: "balances", account_id: account.uid }),
        enableBanking<{ transactions?: Transaction[] }>({ action: "transactions", account_id: account.uid }),
      ]);
      const newestFirst = [...(txResult.transactions ?? [])].sort((a, b) =>
        transactionDate(b).localeCompare(transactionDate(a)),
      );
      setBalances(balanceResult.balances ?? []);
      setTransactions(newestFirst.slice(0, 10));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bankdaten konnten nicht geladen werden");
    } finally {
      setBankBusy(false);
    }
  };

  useEffect(() => {
    if (account?.uid) void refreshBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.uid]);

  const save = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Keine Firmendaten gefunden.");
      const { error } = await supabase
        .from("company_settings")
        .update({
          bank_name: form.bank_name,
          iban: form.iban.replace(/\s+/g, "").toUpperCase(),
          bic: form.bic.replace(/\s+/g, "").toUpperCase(),
          owner_name: form.owner_name,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bankverbindung gespeichert");
      void queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"),
  });

  const connectBank = async () => {
    const bank = banks.find((item) => `${item.name}|${item.country}` === selectedBank);
    if (!bank) {
      toast.error("Bitte zuerst eine Bank auswählen.");
      return;
    }
    setBankBusy(true);
    try {
      const result = await enableBanking<{ url?: string; state?: string }>({ action: "start_auth", bank });
      if (!result.url) throw new Error("Enable Banking hat keine Anmelde-URL geliefert.");
      if (result.state) localStorage.setItem(STATE_KEY, result.state);
      window.location.assign(result.url);
    } catch (e) {
      setBankBusy(false);
      toast.error(e instanceof Error ? e.message : "Verbindung konnte nicht gestartet werden");
    }
  };

  const disconnectBank = async () => {
    setBankBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Keine angemeldete Benutzer-Sitzung.");
      const { error } = await supabase
        .from("bank_connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .eq("provider", SHARED_PROVIDER)
        .eq("status", "connected");
      if (error) throw error;

      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(STATE_KEY);
      setSession(null);
      setBalances([]);
      setTransactions([]);
      await queryClient.invalidateQueries({ queryKey: ["enable-banking-connection"] });
      toast.success("Bankverbindung getrennt");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bankverbindung konnte nicht getrennt werden");
    } finally {
      setBankBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="size-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">Bankverbindung</h1>
          <p className="text-sm text-muted-foreground">Rechnungsdaten und Bankmonitoring an einem Ort.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bankmonitoring (Enable Banking)</CardTitle>
          <CardDescription>Land auswählen, Bank suchen und Konto sicher über Open Banking verbinden.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ShieldCheck className="size-4" />
            <span>API: {appInfo?.active === false ? "nicht aktiv" : "bereit"}</span>
            {appInfo?.environment && <span className="rounded bg-muted px-2 py-1">{appInfo.environment}</span>}
          </div>

          {!session ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="enable-country">Land</Label>
                  <select
                    id="enable-country"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    disabled={bankBusy}
                  >
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country.code} value={country.code}>{country.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="enable-bank-search">Bank suchen</Label>
                  <Input
                    id="enable-bank-search"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="z. B. Sparkasse"
                    disabled={banksLoading || bankBusy}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="enable-bank">Bank auswählen</Label>
                  <select
                    id="enable-bank"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    disabled={banksLoading || bankBusy}
                  >
                    <option value="">
                      {banksLoading
                        ? "Banken werden geladen…"
                        : filteredBanks.length
                          ? `${filteredBanks.length} Banken verfügbar`
                          : "Keine Bank gefunden"}
                    </option>
                    {filteredBanks.map((bank) => (
                      <option key={`${bank.name}-${bank.country}`} value={`${bank.name}|${bank.country}`}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {appInfo?.environment?.toLowerCase().includes("sandbox")
                    ? "Sandbox zeigt nur Testbanken. In Production erscheinen die echten unterstützten Banken."
                    : `${banks.length} unterstützte Banken für das gewählte Land geladen.`}
                </p>
                <Button onClick={() => void connectBank()} disabled={bankBusy || !selectedBank}>
                  Bankkonto verbinden
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{session.aspsp?.name ?? "Verbundenes Bankkonto"}</p>
                  <p className="text-sm text-muted-foreground">
                    {account?.account_id?.iban ?? account?.name ?? "Konto verbunden"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void refreshBank()} disabled={bankBusy}>
                    <RefreshCw className="mr-2 size-4" /> Aktualisieren
                  </Button>
                  <Button variant="outline" onClick={() => void disconnectBank()} disabled={bankBusy}>
                    <Unplug className="mr-2 size-4" /> Trennen
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {balances.length ? (
                  balances.slice(0, 3).map((balance, index) => (
                    <div key={`${balance.balance_type ?? "balance"}-${index}`} className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">{balance.balance_type ?? "Kontostand"}</p>
                      <p className="mt-1 text-xl font-semibold">
                        {formatMoney(balance.balance_amount?.amount, balance.balance_amount?.currency)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Noch kein Kontostand geladen.</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">Letzte Umsätze</h3>
                {transactions.length ? (
                  <div className="divide-y rounded-lg border">
                    {transactions.map((tx, index) => {
                      const info = Array.isArray(tx.remittance_information)
                        ? tx.remittance_information.join(" ")
                        : tx.remittance_information;
                      return (
                        <div key={`${transactionDate(tx) || "tx"}-${index}`} className="flex items-center justify-between gap-4 p-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{tx.debtor?.name ?? tx.creditor?.name ?? "Bankumsatz"}</p>
                            <p className="truncate text-muted-foreground">{info ?? transactionDate(tx)}</p>
                          </div>
                          <span className="whitespace-nowrap font-medium">
                            {formatMoney(tx.transaction_amount?.amount, tx.transaction_amount?.currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Noch keine Umsätze geladen.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bankdaten auf Rechnungen</CardTitle>
          <CardDescription>Kontoinhaber, IBAN und BIC für Zahlungen Ihrer Kunden.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="owner_name">Kontoinhaber</Label>
            <Input id="owner_name" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank</Label>
            <Input id="bank_name" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bic">BIC</Label>
            <Input id="bic" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input id="iban" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => save.mutate()} disabled={isLoading || save.isPending}>
              {save.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
