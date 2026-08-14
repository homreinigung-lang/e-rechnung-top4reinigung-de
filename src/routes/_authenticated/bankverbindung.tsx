import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Landmark,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney } from "@/lib/format";
import {
  confirmBankMatch,
  finishBankLink,
  getBankStatus,
  ignoreBankTransaction,
  listInstitutions,
  removeBankConnection,
  startBankLink,
  syncBankTransactions,
} from "@/lib/bank.functions";

export const Route = createFileRoute("/_authenticated/bankverbindung")({
  head: () => ({
    meta: [
      { title: "Bankverbindung – HomR" },
      {
        name: "description",
        content:
          "Bankdaten hinterlegen, Bankkonto verbinden und Zahlungseingänge automatisch Rechnungen zuordnen.",
      },
      { property: "og:title", content: "Bankverbindung – HomR" },
      {
        property: "og:description",
        content: "Bankkonto verbinden und Kontoumsätze automatisch abgleichen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BankverbindungPage,
});

type BankForm = {
  bank_name: string;
  iban: string;
  bic: string;
  owner_name: string;
};

function BankverbindungPage() {
  const queryClient = useQueryClient();
  const [bankingOpen, setBankingOpen] = useState(false);
  const [search, setSearch] = useState("");

  const bankStatusFn = useServerFn(getBankStatus);
  const institutionsFn = useServerFn(listInstitutions);
  const startLinkFn = useServerFn(startBankLink);
  const finishLinkFn = useServerFn(finishBankLink);
  const syncFn = useServerFn(syncBankTransactions);
  const confirmFn = useServerFn(confirmBankMatch);
  const ignoreFn = useServerFn(ignoreBankTransaction);
  const removeFn = useServerFn(removeBankConnection);

  const [form, setForm] = useState<BankForm>({
    bank_name: "",
    iban: "",
    bic: "",
    owner_name: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        bank_name: settings.bank_name ?? "",
        iban: settings.iban ?? "",
        bic: settings.bic ?? "",
        owner_name: settings.owner_name ?? "",
      });
    }
  }, [settings]);

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
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen"),
  });

  // --- Banking ---------------------------------------------------------
  const { data: bankStatus } = useQuery({
    queryKey: ["bank_status"],
    queryFn: () => bankStatusFn({}),
  });

  const { data: connections } = useQuery({
    queryKey: ["bank_connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["bank_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .order("booking_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["bank_open_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, number, total, customer_name, customer_company, issue_date, status")
        .eq("type", "invoice")
        .order("issue_date", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invoiceById = useMemo(
    () => new Map((invoices ?? []).map((d) => [d.id, d])),
    [invoices],
  );

  const { data: institutions, isFetching: institutionsLoading } = useQuery({
    queryKey: ["bank_institutions"],
    queryFn: () => institutionsFn({ data: { country: "DE" } }),
    enabled: bankingOpen && bankStatus?.configured === true,
    staleTime: 1000 * 60 * 60,
  });

  const filteredInstitutions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = institutions ?? [];
    if (!q) return list.slice(0, 60);
    return list
      .filter((i) => i.name.toLowerCase().includes(q) || i.bic.toLowerCase().includes(q))
      .slice(0, 60);
  }, [institutions, search]);

  const connect = useMutation({
    mutationFn: async (bank: { id: string; name: string }) =>
      startLinkFn({
        data: {
          institutionId: bank.id,
          institutionName: bank.name,
          redirectUrl: `${window.location.origin}/bankverbindung`,
        },
      }),
    onSuccess: (res) => {
      window.location.href = res.link;
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Verbindung fehlgeschlagen"),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({}),
    onSuccess: (res) => {
      toast.success(
        `${res.imported} Umsätze geladen · ${res.matched} automatisch zugeordnet`,
      );
      void queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["bank_connections"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Abruf fehlgeschlagen"),
  });

  const confirmMatch = useMutation({
    mutationFn: (v: { transactionId: string; documentId: string; bookingDate: string }) =>
      confirmFn({ data: v }),
    onSuccess: () => {
      toast.success("Rechnung als bezahlt markiert");
      void queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["bank_open_invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Zuordnung fehlgeschlagen"),
  });

  const ignore = useMutation({
    mutationFn: (v: { id: string; ignored: boolean }) => ignoreFn({ data: v }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bank_transactions"] });
    },
  });

  const removeConn = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Bankverbindung entfernt");
      void queryClient.invalidateQueries({ queryKey: ["bank_connections"] });
    },
  });

  // Rückkehr von der Bank: Anbindung abschließen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    window.history.replaceState({}, "", window.location.pathname);
    void finishLinkFn({ data: { requisitionId: ref } })
      .then(async () => {
        toast.success("Bankkonto verbunden");
        await queryClient.invalidateQueries({ queryKey: ["bank_connections"] });
        sync.mutate();
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Anbindung fehlgeschlagen"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="size-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold">Bankverbindung</h1>
          <p className="text-sm text-muted-foreground">
            Diese Daten erscheinen auf Rechnungen und im GiroCode (QR-Code).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bankdaten</CardTitle>
          <CardDescription>
            Kontoinhaber, IBAN und BIC für Zahlungen Ihrer Kunden.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="owner_name">Kontoinhaber</Label>
            <Input
              id="owner_name"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              placeholder="Hom Reinigung Service"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank</Label>
            <Input
              id="bank_name"
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              placeholder="Sparkasse Saarbrücken"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bic">BIC</Label>
            <Input
              id="bic"
              value={form.bic}
              onChange={(e) => setForm({ ...form, bic: e.target.value })}
              placeholder="SAKSDE55XXX"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="DE00 0000 0000 0000 0000 00"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              onClick={() => save.mutate()}
              disabled={isLoading || save.isPending}
            >
              {save.isPending ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Bankkonto-Anbindung
          </CardTitle>
          <CardDescription>
            Bank auswählen, sicher per PSD2 verbinden und Zahlungseingänge
            automatisch offenen Rechnungen zuordnen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bankStatus && !bankStatus.configured && (
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Die Bank-Zugangsdaten (GoCardless) sind noch nicht hinterlegt. Sobald
              sie gespeichert sind, können Sie Ihre Bank direkt auswählen.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setBankingOpen(true)}
              disabled={!bankStatus?.configured}
            >
              <Link2 className="size-4" /> Bank verbinden
            </Button>
            <Button
              variant="outline"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || (connections?.length ?? 0) === 0}
            >
              <RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"} />
              Umsätze abrufen
            </Button>
          </div>

          {(connections?.length ?? 0) > 0 && (
            <div className="divide-y rounded-md border">
              {connections?.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Landmark className="size-4 text-muted-foreground" />
                  <span className="font-medium">{c.institution_name || c.institution_id}</span>
                  <Badge variant={c.status === "linked" ? "default" : "secondary"}>
                    {c.status === "linked" ? "Verbunden" : "Ausstehend"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {c.account_ids?.length ?? 0} Konto/Konten
                    {c.last_sync_at
                      ? ` · Letzter Abruf ${formatDate(c.last_sync_at)}`
                      : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-destructive"
                    onClick={() => removeConn.mutate(c.id)}
                  >
                    <Trash2 className="size-4" /> Entfernen
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Dialog open={bankingOpen} onOpenChange={setBankingOpen}>
            <DialogContent className="max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Landmark className="size-4" /> Bank auswählen
                </DialogTitle>
                <DialogDescription>
                  Wählen Sie Ihre Bank. Die Anmeldung erfolgt sicher direkt bei der
                  Bank – wir speichern keine Zugangsdaten.
                </DialogDescription>
              </DialogHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Bank suchen (z. B. Sparkasse, Volksbank)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[45vh] space-y-1 overflow-y-auto">
                {institutionsLoading && (
                  <p className="p-3 text-sm text-muted-foreground">Banken werden geladen…</p>
                )}
                {!institutionsLoading && filteredInstitutions.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Keine Bank gefunden.</p>
                )}
                {filteredInstitutions.map((bank) => (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => connect.mutate({ id: bank.id, name: bank.name })}
                    disabled={connect.isPending}
                    className="flex w-full items-center gap-3 rounded-md border p-2 text-left text-sm hover:bg-secondary"
                  >
                    {bank.logo ? (
                      <img src={bank.logo} alt="" className="size-6 rounded" />
                    ) : (
                      <Landmark className="size-6 text-muted-foreground" />
                    )}
                    <span className="font-medium">{bank.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{bank.bic}</span>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontoumsätze</CardTitle>
          <CardDescription>
            Importierte Buchungen und automatische Zuordnung zu offenen Rechnungen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(transactions?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Umsätze vorhanden. Verbinden Sie ein Konto und klicken Sie
              auf „Umsätze abrufen“.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Datum</th>
                    <th className="py-2 pr-3">Zahler / Empfänger</th>
                    <th className="py-2 pr-3">Verwendungszweck</th>
                    <th className="py-2 pr-3 text-right">Betrag</th>
                    <th className="py-2 pr-3">Zuordnung</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {transactions?.map((t) => {
                    const doc = t.matched_document_id
                      ? invoiceById.get(t.matched_document_id)
                      : undefined;
                    return (
                      <tr
                        key={t.id}
                        className={t.ignored ? "border-b opacity-50" : "border-b"}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatDate(t.booking_date)}
                        </td>
                        <td className="py-2 pr-3">{t.counterparty_name || "—"}</td>
                        <td className="py-2 pr-3 max-w-[22rem] truncate">
                          {t.remittance_info || "—"}
                        </td>
                        <td
                          className={
                            Number(t.amount) >= 0
                              ? "py-2 pr-3 text-right font-medium text-primary whitespace-nowrap"
                              : "py-2 pr-3 text-right whitespace-nowrap"
                          }
                        >
                          {formatMoney(Number(t.amount))}
                        </td>
                        <td className="py-2 pr-3">
                          {doc ? (
                            <Badge variant={doc.status === "paid" ? "default" : "secondary"}>
                              {doc.number} · {formatMoney(Number(doc.total))}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Offen</span>
                          )}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {doc && doc.status !== "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                confirmMatch.mutate({
                                  transactionId: t.id,
                                  documentId: doc.id,
                                  bookingDate: t.booking_date,
                                })
                              }
                            >
                              <Check className="size-4" /> Als bezahlt
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              ignore.mutate({ id: t.id, ignored: !t.ignored })
                            }
                          >
                            <X className="size-4" />
                            {t.ignored ? "Zurückholen" : "Ignorieren"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
