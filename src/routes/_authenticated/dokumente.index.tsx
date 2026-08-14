import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  parseGermanDate,
  today,
  addDays,
} from "@/lib/format";
import {
  completeQuote,
  convertQuoteToInvoice,
  declineQuote,
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
  validateSearch: (search: Record<string, unknown>): { tab?: "invoice" | "quote" | undefined } => ({
    tab: search["tab"] === "quote" ? "quote" : search["tab"] === "invoice" ? "invoice" : undefined,
  }),

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
  const search = Route.useSearch();
  const [tab, setTab] = useState<"invoice" | "quote">(search.tab ?? "invoice");


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

  type DocTarget = { id: string; label: string } | null;
  const [payTarget, setPayTarget] = useState<DocTarget>(null);
  const [payDate, setPayDate] = useState<string>(formatDate(today()));
  const [deleteTarget, setDeleteTarget] = useState<DocTarget>(null);
  const [declineTarget, setDeclineTarget] = useState<DocTarget>(null);
  const [declineReason, setDeclineReason] = useState("");


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
          notes:
            type === "quote"
              ? "Ihre Zufriedenheit und eine langfristige, vertrauensvolle Zusammenarbeit sind uns besonders wichtig. Unser Anspruch ist es, nicht einfach nur zu arbeiten, sondern gute und sorgfältige Arbeit zu leisten. Sollten Sie besondere Wünsche haben oder mit einer ausgeführten Leistung nicht zufrieden sein, teilen Sie uns dies bitte direkt mit."
              : "",
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
            is_optional: i.is_optional,
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

      // Verweise anderer Belege lösen, damit der Entwurf gelöscht werden kann
      await supabase
        .from("documents")
        .update({ converted_document_id: null })
        .eq("converted_document_id", docId);
      await supabase
        .from("documents")
        .update({ cancels_document_id: null })
        .eq("cancels_document_id", docId);
      await supabase
        .from("documents")
        .update({ cancelled_by_document_id: null })
        .eq("cancelled_by_document_id", docId);
      await supabase
        .from("recurring_invoices")
        .update({ template_document_id: null })
        .eq("template_document_id", docId);

      const { error: itemsError } = await supabase
        .from("document_items")
        .delete()
        .eq("document_id", docId);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from("documents").delete().eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entwurf gelöscht");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: unknown) => toast.error(describeGobdError(e), { duration: 9000 }),
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

  const decline = useMutation({
    mutationFn: ({ docId, reason }: { docId: string; reason: string }) =>
      declineQuote(docId, reason),
    onSuccess: () => {
      toast.success("Angebot als abgelehnt archiviert");
      setDeclineTarget(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: (docId: string) => completeQuote(docId),
    onSuccess: () => {
      toast.success("Auftrag abgeschlossen");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: (docId: string) => convertQuoteToInvoice(docId),
    onSuccess: (newId) => {
      toast.success("Rechnung aus Auftrag erstellt");
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

      {tab === "quote" ? (
        <AngebotsTabelle
          list={list}
          decide={decide}
          decline={(id: string, label: string) => {
            setDeclineTarget({ id, label });
            setDeclineReason("");
          }}
          convert={convert}
          complete={complete}
          duplicate={duplicate}
          remove={remove}
          isLocked={(r: Record<string, unknown>) => isLockedDocument(r)}
        />
      ) : (
        <div className="surface overflow-hidden">
          {list.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              Noch keine Rechnungen vorhanden.
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
                        <div className="text-xs text-muted-foreground">
                          {STATUS_LABEL[d.status]}
                        </div>
                      </div>
                    </Link>

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

                    {/* Zahlungsstatus ist von der GoBD-Sperre ausgenommen – jederzeit möglich. */}
                    {d.type === "invoice" && d.status !== "paid" && d.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Als bezahlt markieren (Zahlungsdatum erfassen)"
                        onClick={() => {
                          setPayTarget({ id: d.id, label: `${DOC_TYPE_LABEL[d.type]} ${d.number}` });
                          setPayDate(formatDate(today()));
                        }}
                        disabled={markPaid.isPending}
                      >
                        <BadgeEuro className="size-4 text-primary" />
                      </Button>
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
                        setDeleteTarget({
                          id: d.id,
                          label: `${DOC_TYPE_LABEL[d.type]} ${d.number}`,
                        });
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
      )}

      <Dialog open={payTarget !== null} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Als bezahlt markieren</DialogTitle>
            <DialogDescription>
              {payTarget?.label} – Zahlungsdatum im Format TT.MM.JJJJ erfassen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Zahlungsdatum</Label>
            <Input
              id="pay-date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              placeholder="TT.MM.JJJJ"
              inputMode="numeric"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                const iso = parseGermanDate(payDate);
                if (!iso) {
                  toast.error("Bitte das Datum im Format TT.MM.JJJJ eingeben.");
                  return;
                }
                if (!payTarget) return;
                markPaid.mutate({ docId: payTarget.id, date: iso });
                setPayTarget(null);
              }}
              disabled={markPaid.isPending}
            >
              Zahlung buchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entwurf löschen</DialogTitle>
            <DialogDescription>
              {deleteTarget?.label} wirklich unwiderruflich löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                remove.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
              disabled={remove.isPending}
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineTarget !== null} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Angebot ablehnen</DialogTitle>
            <DialogDescription>
              {declineTarget?.label}: Grund der Ablehnung für das Archiv festhalten (optional).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Ablehnungsgrund</Label>
            <Input
              id="decline-reason"
              value={declineReason}
              placeholder="z. B. Preis zu hoch, anderer Anbieter"
              onChange={(e) => setDeclineReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (!declineTarget) return;
                decline.mutate({ docId: declineTarget.id, reason: declineReason });
              }}
              disabled={decline.isPending}
            >
              Als abgelehnt archivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

// ── Farbige Status-Badge für die Angebotsübersicht ──────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted/70 text-muted-foreground border-transparent",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  accepted: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  declined: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  paid: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const label = status === "accepted" ? "Angenommen (Auftrag)" : STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}
    >
      {label}
    </span>
  );
}

type DocRow = {
  id: string;
  type: string;
  number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  customer_name: string;
  customer_company: string;
  total: number | string;
  converted_document_id: string | null;
  [key: string]: unknown;
};

interface AngebotsTabelleProps {
  list: DocRow[];
  decide: { mutate: (v: { docId: string; decision: "accepted" | "declined" }) => void; isPending: boolean };
  decline: (id: string, label: string) => void;
  convert: { mutate: (id: string) => void; isPending: boolean };
  complete: { mutate: (id: string) => void; isPending: boolean };
  duplicate: { mutate: (id: string) => void };
  remove: { mutate: (id: string) => void };
  isLocked: (r: Record<string, unknown>) => boolean;
}

function AngebotsTabelle({
  list,
  decide,
  decline,
  convert,
  complete,
  duplicate,
  remove,
  isLocked,
}: AngebotsTabelleProps) {
  if (list.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-muted-foreground">
        Noch keine Angebote vorhanden.
      </p>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Angebot</th>
            <th className="px-4 py-3 font-medium">Kunde</th>
            <th className="px-4 py-3 text-right font-medium">Betrag</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Aktionen</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {list.map((d) => {
            const r = d as unknown as Record<string, unknown>;
            const deletable = !isLocked(r);
            const isAuftrag = d.status === "accepted" || Boolean(d.converted_document_id);
            return (
              <tr key={d.id} className="align-middle hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link
                    to="/dokumente/$id"
                    params={{ id: d.id }}
                    className="font-medium hover:underline"
                  >
                    {d.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(d.issue_date)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {d.customer_company || d.customer_name || "Ohne Kunde"}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatMoney(Number(d.total))}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={isAuftrag && d.status === "accepted" ? "accepted" : d.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {(d.status === "sent" || d.status === "draft") && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => decide.mutate({ docId: d.id, decision: "accepted" })}
                          disabled={decide.isPending}
                        >
                          <Check className="size-4" /> Angenommen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decline(d.id, `Angebot ${d.number}`)}
                        >
                          <X className="size-4" /> Abgelehnt
                        </Button>
                      </>
                    )}

                    {d.status === "accepted" && !d.converted_document_id && (
                      <Button
                        size="sm"
                        variant="secondary"
                        title="Rechnung direkt aus dem Auftrag erstellen"
                        onClick={() => convert.mutate(d.id)}
                        disabled={convert.isPending}
                      >
                        <ArrowRightLeft className="size-4" /> Rechnung erstellen
                      </Button>
                    )}

                    {(d.status === "accepted" || Boolean(d.converted_document_id)) &&
                      d.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Auftrag als abgeschlossen kennzeichnen"
                          onClick={() => complete.mutate(d.id)}
                          disabled={complete.isPending}
                        >
                          <BadgeEuro className="size-4" /> Bezahlt/Abgeschlossen
                        </Button>
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
                        remove.mutate(d.id);
                      }}
                    >
                      <Trash2
                        className={
                          deletable ? "size-4 text-destructive" : "size-4 text-muted-foreground"
                        }
                      />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

