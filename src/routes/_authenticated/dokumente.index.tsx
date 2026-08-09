import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  deleteBlockedMessage,
  describeGobdError,
  isLockedDocument,
} from "@/lib/gobd-guard";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  nextNumber,
  today,
  addDays,
} from "@/lib/format";
import {
  convertQuoteToInvoice,
  dueInfo,
  mahnLabel,
  mahnungAllowed,
  markInvoicePaid,
  sendReminder,
  setQuoteDecision,
  type ReminderKind,
} from "@/lib/workflow";
import {
  ArrowRightLeft,
  BadgeEuro,
  BellRing,
  Check,
  Copy,
  FileText,
  Gavel,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dokumente/")({
  head: () => ({
    meta: [
      { title: "Rechnungen & Angebote verwalten" },
      {
        name: "description",
        content: "Alle Rechnungen und Angebote der Reinigungsfirma an einem Ort verwalten.",
      },
      { property: "og:title", content: "Rechnungen & Angebote verwalten" },
      {
        property: "og:description",
        content: "Dokumente erstellen, duplizieren, löschen und versenden.",
      },
    ],
  }),
  component: DokumenteListe,
});

function DokumenteListe() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"invoice" | "quote">("invoice");

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (type: "invoice" | "quote") => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const { data: settings } = await supabase
        .from("company_settings")
        .select("payment_terms_days")
        .maybeSingle();

      const number = nextNumber(
        type,
        documents.filter((d) => d.type === type).map((d) => d.number),
      );
      const issue = today();
      const { data, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          type,
          number,
          issue_date: issue,
          due_date: type === "invoice" ? addDays(issue, settings?.payment_terms_days ?? 14) : null,
          reverse_charge: type === "invoice",
          tax_mode: type === "quote" ? "domestic" : "eu_reverse_charge",
          vat_rate: type === "quote" ? 19 : 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (docId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { data: src, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", docId)
        .single();
      if (error) throw error;
      const { data: srcItems } = await supabase
        .from("document_items")
        .select("*")
        .eq("document_id", docId)
        .order("position");

      const number = nextNumber(
        src.type as "invoice" | "quote",
        documents.filter((d) => d.type === src.type).map((d) => d.number),
      );
      const {
        id: _i,
        created_at: _c,
        updated_at: _u,
        sent_at: _s,
        locked_at: _l,
        archived_at: _a,
        pdf_path: _p,
        pdf_sha256: _h,
        is_storno: _st,
        cancels_document_id: _cd,
        cancelled_by_document_id: _cb,
        ...rest
      } = src as unknown as Record<string, unknown>;
      const { data: created, error: insErr } = await supabase
        .from("documents")
        .insert({ ...rest, user_id: userId, number, status: "draft" } as never)
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (srcItems && srcItems.length > 0) {
        await supabase.from("document_items").insert(
          srcItems.map((i, index) => ({
            document_id: created.id,
            user_id: userId,
            position: index + 1,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
          })),
        );
      }
      return created.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Kopie erstellt");
      navigate({ to: "/dokumente/$id", params: { id }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (docId: string) => {
      const doc = documents.find((d) => d.id === docId) as unknown as Record<string, unknown>;
      if (isLockedDocument(doc)) throw new Error(deleteBlockedMessage(doc));
      await supabase.from("document_items").delete().eq("document_id", docId);
      const { error } = await supabase.from("documents").delete().eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entwurf gelöscht");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(describeGobdError(e), { duration: 9000 }),
  });


  const markPaid = useMutation({
    mutationFn: ({ docId, date }: { docId: string; date: string }) => markInvoicePaid(docId, date),
    onSuccess: () => {
      toast.success("Rechnung als bezahlt markiert");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const reminder = useMutation({
    mutationFn: ({ docId, kind }: { docId: string; kind: ReminderKind }) =>
      sendReminder(docId, kind),
    onSuccess: (level) => {
      toast.success(`${mahnLabel(level)} erfasst`);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const decide = useMutation({
    mutationFn: ({ docId, decision }: { docId: string; decision: "accepted" | "declined" }) =>
      setQuoteDecision(docId, decision),
    onSuccess: () => {
      toast.success("Angebotsstatus aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: (docId: string) => convertQuoteToInvoice(docId),
    onSuccess: (newId) => {
      toast.success("Rechnung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = documents.filter((d) => d.type === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rechnungen & Angebote</h1>
          <p className="mt-1 text-muted-foreground">
            Automatische, fortlaufende Nummerierung gemäß § 14 UStG – lückenlos und
            manipulationssicher.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => create.mutate("quote")}>
            <FileText className="size-4" /> Neues Angebot
          </Button>
          <Button onClick={() => create.mutate("invoice")}>
            <Plus className="size-4" /> Neue Rechnung
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "invoice" | "quote")}>
        <TabsList>
          <TabsTrigger value="invoice">
            <Receipt className="mr-2 size-4" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="quote">
            <FileText className="mr-2 size-4" /> Angebote
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="surface overflow-hidden">
        {list.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine {tab === "invoice" ? "Rechnungen" : "Angebote"} vorhanden.
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((d) => {
              const r = d as unknown as Record<string, unknown>;
              const due = dueInfo(d.due_date, d.status);
              const level = Number(r["reminder_level"] ?? 0);
              const deletable = !isLockedDocument(r);
              return (
                <li key={d.id} className="flex items-center gap-2 px-5 py-4 hover:bg-muted/60">
                  <Link
                    to="/dokumente/$id"
                    params={{ id: d.id }}
                    className="flex flex-1 flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium">
                        {DOC_TYPE_LABEL[d.type]} {d.number}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {d.customer_company || d.customer_name || "Ohne Kunde"} ·{" "}
                        {formatDate(d.issue_date)}
                        {due ? (
                          <>
                            {" · "}
                            <span className={due.overdue ? "font-medium text-destructive" : ""}>
                              {due.label}
                            </span>
                          </>
                        ) : null}
                        {level > 0 ? ` · ${mahnLabel(level)}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatMoney(Number(d.total))}</div>
                      <div className="text-xs text-muted-foreground">{STATUS_LABEL[d.status]}</div>
                    </div>
                  </Link>

                  {d.type === "quote" && d.status !== "declined" && !r["converted_document_id"] && (
                    <>
                      {d.status !== "accepted" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Angebot annehmen"
                            onClick={() => decide.mutate({ docId: d.id, decision: "accepted" })}
                          >
                            <Check className="size-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Angebot ablehnen"
                            onClick={() => decide.mutate({ docId: d.id, decision: "declined" })}
                          >
                            <X className="size-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="In Auftrag umwandeln"
                        onClick={() => convert.mutate(d.id)}
                        disabled={convert.isPending}
                      >
                        <ArrowRightLeft className="size-4" />
                      </Button>
                    </>
                  )}

                  {d.type === "invoice" &&
                    d.status !== "paid" &&
                    d.status !== "cancelled" &&
                    d.status !== "draft" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Zahlungserinnerung erfassen"
                          onClick={() => {
                            if (confirm("Freundliche Zahlungserinnerung jetzt senden?")) {
                              reminder.mutate({ docId: d.id, kind: "erinnerung" });
                            }
                          }}
                          disabled={reminder.isPending}
                        >
                          <BellRing className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            mahnungAllowed(d.due_date)
                              ? "Offizielle Mahnung senden"
                              : "Mahnung erst nach Ablauf der Zahlungsfrist (14 Tage) möglich"
                          }
                          onClick={() => {
                            if (confirm("Offizielle Mahnung jetzt senden? [Jetzt senden]")) {
                              reminder.mutate({ docId: d.id, kind: "mahnung" });
                            }
                          }}
                          disabled={reminder.isPending || !mahnungAllowed(d.due_date)}
                        >
                          <Gavel className="size-4" />
                        </Button>
                      </>
                    )}

                  <Button
                    variant="ghost"
                    size="icon"
                    title="Duplizieren"
                    onClick={() => duplicate.mutate(d.id)}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={
                      deletable
                        ? "Entwurf löschen"
                        : "Löschen rechtlich nicht zulässig – bitte stornieren"
                    }
                    onClick={() => {
                      if (!deletable) {
                        toast.error(deleteBlockedMessage(r), { duration: 9000 });
                        return;
                      }
                      if (confirm(`${DOC_TYPE_LABEL[d.type]} ${d.number} wirklich löschen?`)) {
                        remove.mutate(d.id);
                      }
                    }}
                  >
                    <Trash2
                      className={
                        deletable ? "size-4 text-destructive" : "size-4 text-muted-foreground"
                      }
                    />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
