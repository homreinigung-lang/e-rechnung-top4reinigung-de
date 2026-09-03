import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { draftPlaceholderNumber } from "@/lib/doc-number";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { deleteBlockedMessage, describeGobdError, isLockedDocument } from "@/lib/gobd-guard";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  parseGermanDate,
  today,
  addDays,
} from "@/lib/format";
import { formatPeriod, periodForIssueDate, syncMonthInText } from "@/lib/invoice-period";

import {
  completeQuote,
  convertQuoteToOrder,
  convertQuoteToInvoice,
  convertOrderToInvoice,
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
  ClipboardCheck,
  Copy,
  FileText,
  Gavel,
  MoreVertical,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { requireUserId } from "@/lib/auth-user";

export const Route = createFileRoute("/_authenticated/dokumente/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "invoice" | "quote" | "order" | undefined } => ({
    tab:
      search["tab"] === "quote"
        ? "quote"
        : search["tab"] === "order"
          ? "order"
          : search["tab"] === "invoice"
            ? "invoice"
            : undefined,
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
  // Tab kommt ausschließlich aus der URL; dadurch folgt die Anzeige zuverlässig
  // dem ?tab=...-Suchparameter, auch wenn die Route bereits gemountet ist.
  const tab = search.tab ?? "invoice";

  function selectTab(next: "invoice" | "quote" | "order") {
    navigate({ to: "/dokumente", search: { tab: next }, replace: true });
  }

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
      const userId = await requireUserId();

      const { data: settings } = await supabase
        .from("company_settings")
        .select("payment_terms_days, small_business")
        .maybeSingle();

      const smallBusiness = Boolean(
        (settings as Record<string, unknown> | null)?.["small_business"],
      );

      const number = draftPlaceholderNumber(type);
      const issue = today();
      const { data, error } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          type,
          number,
          issue_date: issue,
          due_date: type === "invoice" ? addDays(issue, settings?.payment_terms_days ?? 14) : null,
          reverse_charge: false,
          tax_mode: smallBusiness ? "kleinunternehmer" : "domestic",
          vat_rate: smallBusiness ? 0 : 19,

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
      const userId = await requireUserId();
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

      const number = draftPlaceholderNumber(src.type as "invoice" | "quote" | "order");
      const issueDate = today();
      const period = periodForIssueDate(issueDate);
      const srcRecord = src as unknown as Record<string, unknown>;
      const servicePeriod = period
        ? formatPeriod(period)
        : String(srcRecord["service_period"] ?? "");
      const serviceDescription = period
        ? syncMonthInText(String(srcRecord["service_description"] ?? ""), period.end)
        : String(srcRecord["service_description"] ?? "");
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
        storno_reason: _sr,
        converted_document_id: _cv,
        paid_at: _pa,
        reminder_level: _rl,
        last_reminder_at: _lr,
        retention_until: _ru,
        deleted_at: _dl,
        ...rest
      } = src as unknown as Record<string, unknown>;
      const { data: created, error: insErr } = await supabase
        .from("documents")
        .insert({
          ...rest,
          user_id: userId,
          number,
          status: "draft",
          issue_date: issueDate,
          due_date: null,
          service_period: servicePeriod,
          service_description: serviceDescription,
        } as never)
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

      const { error } = await supabase.rpc("trash_entity", { _entity: "document", _id: docId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("In den Papierkorb verschoben – 30 Tage wiederherstellbar");
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
    mutationFn: (docId: string) => convertQuoteToOrder(docId),
    onSuccess: (newId) => {
      toast.success("Auftragsbestätigung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toInvoice = useMutation({
    mutationFn: (docId: string) => convertOrderToInvoice(docId),
    onSuccess: (newId) => {
      toast.success("Rechnung aus Auftragsbestätigung erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Einmalige Dienstleistung: Angebot ohne Auftragsbestätigung direkt abrechnen.
  const quoteToInvoice = useMutation({
    mutationFn: (docId: string) => convertQuoteToInvoice(docId),
    onSuccess: (newId) => {
      toast.success("Rechnung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Stabile, lückenlose Standard-Sortierung nach Belegnummer (absteigend = neueste zuerst).
  // Die Nummern sind nullgestellt (z. B. RE-2026-0001), daher ist ein lexikalischer
  // Sort identisch mit einer numerischen Sortierung und bleibt über Jahre hinweg stabil.
  const allOfTab = documents
    .filter((d) => d.type === tab)
    .slice()
    .sort((a, b) => String(b.number).localeCompare(String(a.number), "de-DE"));

  // Belegnummern-Nachschlagewerk: Stornobelege zeigen die Original-Rechnungsnummer.
  const numberById = new Map(documents.map((d) => [d.id, String(d.number)]));

  // Stornogrund je Stornobeleg – wird an der Originalrechnung angezeigt.
  const stornoReasonById = new Map(
    documents.map((d) => [
      d.id,
      String((d as unknown as Record<string, unknown>)["storno_reason"] ?? "").trim(),
    ]),
  );

  // Stornobelege erscheinen nie als eigene Zeile: Die Liste zeigt ausschließlich
  // die Originalrechnung, sichtbar markiert mit Stornohinweis.
  const list = allOfTab.filter((d) => !(d as unknown as Record<string, unknown>)["is_storno"]);

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

      <Tabs value={tab} onValueChange={(v) => selectTab(v as "invoice" | "quote" | "order")}>
        <TabsList>
          <TabsTrigger value="invoice">
            <Receipt className="mr-2 size-4" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="quote">
            <FileText className="mr-2 size-4" /> Angebote
          </TabsTrigger>
          <TabsTrigger value="order">
            <ClipboardCheck className="mr-2 size-4" /> Auftragsbestätigungen
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "quote" || tab === "order" ? (
        <AngebotsTabelle
          kind={tab}
          list={list}
          decide={decide}
          decline={(id: string, label: string) => {
            setDeclineTarget({ id, label });
            setDeclineReason("");
          }}
          convert={convert}
          toInvoice={tab === "order" ? toInvoice : quoteToInvoice}
          complete={complete}
          duplicate={duplicate}
          remove={remove}
          isLocked={(r: Record<string, unknown>) => isLockedDocument(r)}
          followUp={(id: string) => {
            const src = documents.find((x) => x.id === id);
            const targetId = src?.converted_document_id ?? null;
            if (!targetId) return null;
            const target = documents.find((x) => x.id === targetId);
            if (!target) return null;
            return { id: target.id, number: String(target.number), type: String(target.type) };
          }}
          onDelete={(id, label) => setDeleteTarget({ id, label })}
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
                const isStorno = Boolean(r["is_storno"]);
                const cancelsNumber = r["cancels_document_id"]
                  ? (numberById.get(String(r["cancels_document_id"])) ?? "")
                  : "";
                const cancelledByNumber = r["cancelled_by_document_id"]
                  ? (numberById.get(String(r["cancelled_by_document_id"])) ?? "")
                  : "";
                const cancelledReason = r["cancelled_by_document_id"]
                  ? (stornoReasonById.get(String(r["cancelled_by_document_id"])) ?? "")
                  : "";
                const due = isStorno ? null : dueInfo(d.due_date, d.status);
                const level = Number(r["reminder_level"] ?? 0);
                const deletable = !isLockedDocument(r);

                return (
                  <li key={d.id} className="px-5 py-4 hover:bg-muted/60">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/dokumente/$id"

                        params={{ id: d.id }}
                        className="flex flex-1 flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>
                              {isStorno ? "Stornorechnung" : DOC_TYPE_LABEL[d.type]} {d.number}
                            </span>
                            {isStorno && cancelsNumber ? (
                              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                Storno zu {cancelsNumber}
                              </span>
                            ) : null}
                            {/* Storno-Hinweis erscheint nur einmal – als Unterzeile unten. */}
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
                            {!isStorno && level > 0 ? ` · ${mahnLabel(level)}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatMoney(Number(d.total))}</div>
                          <div className="text-xs text-muted-foreground">
                            {isStorno ? "Storniert (Korrekturbeleg)" : STATUS_LABEL[d.status]}
                          </div>
                        </div>
                      </Link>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" title="Aktionen">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {d.type === "invoice" &&
                            d.status !== "paid" &&
                            d.status !== "cancelled" &&
                            d.status !== "draft" && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("Freundliche Zahlungserinnerung jetzt senden?")) {
                                      reminder.mutate({ docId: d.id, kind: "erinnerung" });
                                    }
                                  }}
                                  disabled={reminder.isPending}
                                >
                                  <BellRing className="mr-2 size-4" /> Zahlungserinnerung
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (
                                      confirm("Offizielle Mahnung jetzt senden? [Jetzt senden]")
                                    ) {
                                      reminder.mutate({ docId: d.id, kind: "mahnung" });
                                    }
                                  }}
                                  disabled={reminder.isPending || !mahnungAllowed(d.due_date)}
                                >
                                  <Gavel className="mr-2 size-4" /> Mahnung senden
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}

                          {/* Zahlungsstatus ist von der GoBD-Sperre ausgenommen – jederzeit möglich. */}
                          {d.type === "invoice" &&
                            d.status !== "paid" &&
                            d.status !== "cancelled" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setPayTarget({
                                    id: d.id,
                                    label: `${DOC_TYPE_LABEL[d.type]} ${d.number}`,
                                  });
                                  setPayDate(formatDate(today()));
                                }}
                                disabled={markPaid.isPending}
                              >
                                <BadgeEuro className="mr-2 size-4 text-primary" /> Als bezahlt
                                markieren
                              </DropdownMenuItem>
                            )}

                          <DropdownMenuItem onClick={() => duplicate.mutate(d.id)}>
                            <Copy className="mr-2 size-4" /> Duplizieren
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className={deletable ? "text-destructive" : "text-muted-foreground"}
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
                            <Trash2 className="mr-2 size-4" /> Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {cancelledByNumber ? (
                      <p className="mt-1 pl-1 text-xs text-destructive">
                        Storniert durch {cancelledByNumber}
                        {cancelledReason ? ` · Grund: ${cancelledReason}` : ""}
                      </p>
                    ) : null}
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
  accepted: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  declined: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  paid: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const label = status === "accepted" ? "Angenommen (Auftrag)" : (STATUS_LABEL[status] ?? status);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES["draft"]}`}
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
  /** "quote" = Angebote, "order" = Auftragsbestätigungen. */
  kind: "quote" | "order";
  list: DocRow[];
  decide: {
    mutate: (v: { docId: string; decision: "accepted" | "declined" }) => void;
    isPending: boolean;
  };
  decline: (id: string, label: string) => void;
  convert: { mutate: (id: string) => void; isPending: boolean };
  /** Angebot bzw. Auftragsbestätigung direkt in eine Rechnung umwandeln. */
  toInvoice: { mutate: (id: string) => void; isPending: boolean };
  complete: { mutate: (id: string) => void; isPending: boolean };
  duplicate: { mutate: (id: string) => void };
  remove: { mutate: (id: string) => void };
  isLocked: (r: Record<string, unknown>) => boolean;
  /** Nachschlagewerk für den erzeugten Folgebeleg (Nummer + Typ). */
  followUp: (id: string) => { id: string; number: string; type: string } | null;
  /** Öffnet den gemeinsamen Lösch-Bestätigungsdialog (deleteTarget) aus DokumenteListe. */
  onDelete: (id: string, label: string) => void;
}

function AngebotsTabelle({
  kind,
  list,
  decide,
  decline,
  convert,
  toInvoice,
  complete,
  duplicate,
  remove,
  isLocked,
  followUp,
  onDelete,
}: AngebotsTabelleProps) {
  const navigate = useNavigate();
  const isOrder = kind === "order";
  const label = isOrder ? "Auftragsbestätigung" : "Angebot";

  if (list.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-muted-foreground">
        {isOrder ? "Noch keine Auftragsbestätigungen vorhanden." : "Noch keine Angebote vorhanden."}
      </p>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">{label}</th>
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
              <tr
                key={d.id}
                className="cursor-pointer align-middle hover:bg-muted/40"
                title={`${label} öffnen und bearbeiten`}
                onClick={() => navigate({ to: "/dokumente/$id", params: { id: d.id } })}
              >
                <td className="px-4 py-3">
                  <Link
                    to="/dokumente/$id"
                    params={{ id: d.id }}
                    className="font-medium hover:underline"
                  >
                    {d.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatDate(d.issue_date)}</div>
                </td>
                <td className="px-4 py-3">
                  {d.customer_company || d.customer_name || "Ohne Kunde"}
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatMoney(Number(d.total))}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={isAuftrag && d.status === "accepted" ? "accepted" : d.status}
                  />
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="Aktionen">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {!isOrder && (d.status === "sent" || d.status === "draft") && (
                          <>
                            <DropdownMenuItem
                              onClick={() => decide.mutate({ docId: d.id, decision: "accepted" })}
                              disabled={decide.isPending}
                            >
                              <Check className="mr-2 size-4" /> Angebot annehmen
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => decline(d.id, `Angebot ${d.number}`)}>
                              <X className="mr-2 size-4" /> Angebot ablehnen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}

                        <DropdownMenuItem
                          onClick={() =>
                            navigate({
                              to: "/dokumente/$id",
                              params: { id: d.id },
                              search: { bearbeiten: true },
                            })
                          }
                        >
                          <FileText className="mr-2 size-4" /> {label} bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => navigate({ to: "/dokumente/$id", params: { id: d.id } })}
                        >
                          <Receipt className="mr-2 size-4" /> {label} ansehen & PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {!isOrder && d.status === "accepted" && !d.converted_document_id && (
                          <DropdownMenuItem
                            title="Auftragsbestätigung aus dem Angebot erstellen"
                            onClick={() => convert.mutate(d.id)}
                            disabled={convert.isPending}
                          >
                            <ClipboardCheck className="mr-2 size-4" /> Auftragsbestätigung erstellen
                          </DropdownMenuItem>
                        )}

                        {!d.converted_document_id && (isOrder || d.status === "accepted") && (
                          <DropdownMenuItem
                            title={
                              isOrder
                                ? "Rechnung aus der Auftragsbestätigung erstellen"
                                : "Rechnung direkt aus dem Angebot erstellen"
                            }
                            onClick={() => toInvoice.mutate(d.id)}
                            disabled={toInvoice.isPending}
                          >
                            <ArrowRightLeft className="mr-2 size-4" /> Rechnung erstellen
                          </DropdownMenuItem>
                        )}

                        {(() => {
                          const next = followUp(d.id);
                          if (!next) return null;
                          const nextLabel =
                            next.type === "invoice" ? "Rechnung öffnen" : "Folgebeleg öffnen";
                          return (
                            <DropdownMenuItem
                              title={`Bereits erstellt: ${next.number}`}
                              onClick={() =>
                                navigate({ to: "/dokumente/$id", params: { id: next.id } })
                              }
                            >
                              <ArrowRightLeft className="mr-2 size-4" /> {nextLabel} ({next.number})
                            </DropdownMenuItem>
                          );
                        })()}


                        {!isOrder &&
                          (d.status === "accepted" || Boolean(d.converted_document_id)) &&
                          d.status !== "paid" && (
                            <DropdownMenuItem
                              onClick={() => complete.mutate(d.id)}
                              disabled={complete.isPending}
                            >
                              <BadgeEuro className="mr-2 size-4" /> Bezahlt/Abgeschlossen
                            </DropdownMenuItem>
                          )}

                        <DropdownMenuItem onClick={() => duplicate.mutate(d.id)}>
                          <Copy className="mr-2 size-4" /> Duplizieren
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={deletable ? "text-destructive" : "text-muted-foreground"}
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
                            onDelete(d.id, `${label} ${d.number}`);
                          }}
                        >
                          <Trash2 className="mr-2 size-4" /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
