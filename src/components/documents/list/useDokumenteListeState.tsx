import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { summarizeOpenInvoices } from "@/lib/open-invoices";
import { draftPlaceholderNumber } from "@/lib/doc-number";

import { toast } from "sonner";
import { deleteBlockedMessage, describeGobdError, isLockedDocument } from "@/lib/gobd-guard";
import { formatDate, today, addDays } from "@/lib/format";
import { formatPeriod, periodForIssueDate, syncMonthInText } from "@/lib/invoice-period";
import {
  completeQuote,
  convertQuoteToOrder,
  convertQuoteToInvoice,
  convertOrderToInvoice,
  declineQuote,
  dueInfo,
  mahnLabel,
  markInvoicePaid,
  sendReminder,
  setQuoteDecision,
  type ReminderKind,
} from "@/lib/workflow";

import { requireUserId } from "@/lib/auth-user";

import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/dokumente/");

export function useDokumenteListeState() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = routeApi.useSearch();
  // Tab kommt ausschließlich aus der URL; dadurch folgt die Anzeige zuverlässig
  // dem ?tab=...-Suchparameter, auch wenn die Route bereits gemountet ist.
  const tab = search.tab ?? "invoice";

  function selectTab(next: "invoice" | "quote" | "order") {
    navigate({ to: "/dokumente", search: { tab: next }, replace: true });
  }

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      return fetchAllRows(() =>
        supabase.from("documents").select("*").order("issue_date", { ascending: false }),
      );
    },
  });

  type DocTarget = { id: string; label: string } | null;
  const [payTarget, setPayTarget] = useState<DocTarget>(null);
  const [payDate, setPayDate] = useState<string>(formatDate(today()));
  const [deleteTarget, setDeleteTarget] = useState<DocTarget>(null);
  const [declineTarget, setDeclineTarget] = useState<DocTarget>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "open" | "overdue" | "paid">("all");

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

  // Offene-Posten-Übersicht für Rechnungen.
  const invoiceRows = list.filter((d) => d.type === "invoice");
  const { items: openInvoices, total: openAmount } = summarizeOpenInvoices(invoiceRows);
  const overdueInvoices = openInvoices.filter((d) =>
    Boolean(dueInfo(d.due_date, d.status)?.overdue),
  );
  const paidInvoices = invoiceRows.filter((d) => d.status === "paid");
  const overdueAmount = overdueInvoices.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
  const paidAmount = paidInvoices.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
  const filteredInvoices =
    invoiceFilter === "open"
      ? openInvoices
      : invoiceFilter === "overdue"
        ? overdueInvoices
        : invoiceFilter === "paid"
          ? paidInvoices
          : invoiceRows;

  return {
    ready: true as const,
    complete,
    convert,
    create,
    decide,
    decline,
    declineReason,
    declineTarget,
    deleteTarget,
    documents,
    duplicate,
    filteredInvoices,
    invoiceFilter,
    list,
    markPaid,
    numberById,
    openAmount,
    openInvoices,
    overdueAmount,
    overdueInvoices,
    paidAmount,
    paidInvoices,
    payDate,
    payTarget,
    quoteToInvoice,
    reminder,
    remove,
    selectTab,
    setDeclineReason,
    setDeclineTarget,
    setDeleteTarget,
    setInvoiceFilter,
    setPayDate,
    setPayTarget,
    stornoReasonById,
    tab,
    toInvoice,
  };
}
export type DokumenteListeState = Extract<
  ReturnType<typeof useDokumenteListeState>,
  { ready: true }
>;
