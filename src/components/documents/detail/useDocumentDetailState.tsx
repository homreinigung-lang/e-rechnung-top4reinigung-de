import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DOC_TYPE_LABEL,
  formatDate,
  formatMoney,
  formatNumber,
  taxNoteForTaxMode,
  today,
  vatRateForTaxMode,
} from "@/lib/format";
import { computeDocumentTotals, hasDiscountPosition } from "@/lib/document-totals";
import { useCanReverseCharge } from "@/lib/subscriptions";
import { buildEpcPayload } from "@/lib/epc";
import {
  QUOTE_DISCLAIMER,
  CANCELLATION_TERMS,
  ORDER_INTRO,
  INVOICE_INTRO,
  defaultQuoteIntro,
  orderHeadline,
  deriveServiceName,
  quoteHeadline,
} from "@/lib/document-texts";
import { type DocumentConfirmDialogState } from "@/components/documents/DocumentConfirmDialog";
import { isEmptyDraft } from "@/lib/empty-draft";
import { buildDocumentMail } from "@/lib/document-mail";
import { buildDocumentSenderLine } from "@/lib/document-sender-line";
import { buildInitialDocumentForm } from "@/lib/document-initial-form";
import { loadDocumentLogo } from "@/lib/document-logo";
import { fetchDocumentDetail, type DocumentItem as Item } from "@/lib/document-detail-query";
import { useFileUrl } from "@/hooks/useFileUrl";
import { archiveDocumentPdf, createStorno, finalizeDocument, logAudit } from "@/lib/gobd";
import { draftPlaceholderNumber, ensureOfficialNumber, isDraftPlaceholder } from "@/lib/doc-number";
import {
  deleteBlockedMessage,
  describeGobdError,
  editBlockedMessage,
  isLockedDocument,
} from "@/lib/gobd-guard";
import {
  convertQuoteToOrder,
  convertQuoteToInvoice,
  convertOrderToInvoice,
  dueInfo,
  mahnLabel,
  mahnungAllowed,
  markInvoicePaid,
  unmarkInvoicePaid,
  sendReminder,
  setQuoteDecision,
  type ReminderKind,
} from "@/lib/workflow";
import {
  checkInvoiceDates,
  formatPeriod,
  periodForIssueDate,
  syncMonthInText,
} from "@/lib/invoice-period";
import { findDuplicateInvoice } from "@/lib/invoice-duplicate";
import { ensureCustomerForAcceptedQuote } from "@/lib/prospect-customer";
import { downloadBytes } from "@/lib/pdf";
import { buildDocumentPdfBytes, type PdfDocData } from "@/lib/invoice-pdf";
import {
  buildXRechnungXml,
  buildZugferdXml,
  downloadXml,
  embedZugferdXml,
  validateERechnung,
  type ERechnungInput,
} from "@/lib/erechnung";
import { OPTIONAL_NOTE } from "./shared";
import { getRouteApi } from "@tanstack/react-router";
const routeApi = getRouteApi("/_authenticated/dokumente/$id");

export function useDocumentDetailState() {
  const { id } = routeApi.useParams();
  const { bearbeiten } = routeApi.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Standard ist die saubere Vorschau; Bearbeiten wird bewusst geöffnet.
  const [editMode, setEditMode] = useState(Boolean(bearbeiten));
  const [quoteRecipientMode, setQuoteRecipientMode] = useState<"interessent" | "kunde">(
    "interessent",
  );

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocumentDetail(id),
  });

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<DocumentConfirmDialogState | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stornoOpen, setStornoOpen] = useState(false);
  const [stornoReason, setStornoReason] = useState("");

  const [payDate, setPayDate] = useState<string>("");
  // Autosave: letzte gespeicherte Fassung als Vergleichs-Fingerabdruck.
  const savedSnapshotRef = useRef<string>("");
  const [autoSavedAt, setAutoSavedAt] = useState<string>("");

  // Schutz gegen Überschreiben: die Eingabefelder gehören allein dem lokalen
  // State. Server-Daten werden nur beim ersten Laden dieses Belegs übernommen –
  // Refetches nach Autosave/Hintergrund-Mutationen füllen die Felder nie nach.
  const initializedIdRef = useRef<string>("");
  // Formularstand direkt nach dem Laden – Referenz für „unberührter Entwurf“.
  const baselineFormRef = useRef<Record<string, string | boolean | null> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (initializedIdRef.current === id) return;
    initializedIdRef.current = id;
    const initialForm = buildInitialDocumentForm(data);
    baselineFormRef.current = initialForm;
    setForm(initialForm);
    setQuoteRecipientMode(initialForm["customer_id"] ? "kunde" : "interessent");

    setItems(
      data.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        is_optional: Boolean((i as unknown as Record<string, unknown>)["is_optional"]),
      })),
    );
    savedSnapshotRef.current = "";
  }, [data, id]);

  const { canReverseCharge, isLoading: planLoading } = useCanReverseCharge();
  const isSmallBusiness = Boolean(
    (data?.settings as Record<string, unknown> | null | undefined)?.["small_business"],
  );
  // Kundentyp: Privatkunden ohne Firmen-/Steuerfelder.
  const isPrivat = String(form["customer_type"] ?? "firma") === "privat";
  // Bestandsschutz: Belege, die bereits als Reverse-Charge gespeichert wurden,
  // dürfen nie automatisch auf 19 % Inland umgestellt werden.
  const storedTaxMode = String(
    (data?.doc as Record<string, unknown> | undefined)?.["tax_mode"] ?? "",
  );
  const reverseChargeAllowed =
    canReverseCharge || planLoading || storedTaxMode === "eu_reverse_charge";
  const rawTaxMode = String(form["tax_mode"] ?? "domestic");
  // Kleinunternehmer § 19 UStG: nie Umsatzsteuer ausweisen.
  // Feature-Gate: Reverse-Charge nur ab Pro – neue Belege von Basis-Konten rechnen mit 19 % ab.
  const taxMode = isSmallBusiness
    ? "kleinunternehmer"
    : rawTaxMode === "eu_reverse_charge" && !reverseChargeAllowed
      ? "domestic"
      : rawTaxMode;
  const vatRate = vatRateForTaxMode(taxMode);
  const taxNote = taxNoteForTaxMode(taxMode);

  const logoSrc = useFileUrl(
    data?.settings && (data.settings as Record<string, unknown>)["logo_url"]
      ? String((data.settings as Record<string, unknown>)["logo_url"])
      : "",
  );

  const hasOptionalItems = useMemo(() => items.some((i) => i.is_optional), [items]);
  const regularTotal = useMemo(
    () =>
      items
        .filter((i) => !i.is_optional)
        .reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );
  /**
   * Enthält der Beleg bereits eine aus der Kalkulation übertragene
   * Rabattposition (negativer Einzelpreis), darf kein zweiter Belegrabatt
   * greifen – sonst würde derselbe Nachlass doppelt abgezogen.
   */
  const discountItemPresent = useMemo(() => hasDiscountPosition(items), [items]);
  const enteredDiscountPercent = Math.min(
    100,
    Math.max(0, Number(String(form["discount_percent"] ?? "0").replace(",", ".")) || 0),
  );
  const discountPercent = discountItemPresent ? 0 : enteredDiscountPercent;
  const discountReason = String(form["discount_reason"] ?? "");
  const { itemsTotal, discountAmount, netTotal, vatAmount, grossTotal } = computeDocumentTotals(
    items,
    discountPercent,
    vatRate,
  );

  /** Schreibt Kopf und Positionen des Belegs in die Datenbank (Speichern + Autosave). */
  const persistDocument = useCallback(async () => {
    const current = data?.doc as unknown as Record<string, unknown> | undefined;
    // Schutz: echte Belege (versendet/festgeschrieben) dürfen nie überschrieben werden.
    if (isLockedDocument(current)) throw new Error(editBlockedMessage(current));
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("Nicht angemeldet");
    // Nummern werden automatisch/fortlaufend vergeben und nie aus dem Formular übernommen.
    const number = String((data?.doc as { number?: string } | undefined)?.number ?? "").trim();
    if (!number) throw new Error("Beleg konnte nicht geladen werden.");

    const selectedProjectId = String(form["project_id"] ?? "").trim();
    if (selectedProjectId) {
      const selectedProject = data?.projects.find((p) => p.id === selectedProjectId);
      const selectedCustomerId = String(form["customer_id"] ?? "").trim();
      if (
        !selectedProject ||
        !selectedCustomerId ||
        selectedProject.customer_id !== selectedCustomerId
      ) {
        throw new Error(
          "Das gewählte Objekt gehört nicht zu diesem Kunden. Bitte Kunde und Objekt korrekt zuordnen.",
        );
      }
    }

    if (String(current?.["type"] ?? "") === "invoice") {
      // 1. Rechnungsdatum darf nicht vor dem Leistungszeitraum liegen.
      const check = checkInvoiceDates(
        String(form["issue_date"] ?? ""),
        String(form["service_period"] ?? ""),
      );
      if (check.level === "error") throw new Error(check.message);

      // 2. Keine zweite Rechnung für denselben Kunden und Leistungsmonat.
      if (String(form["status"] ?? "draft") !== "draft") {
        const dup = await findDuplicateInvoice({
          currentId: id,
          customerId: (form["customer_id"] as string | null) || null,
          servicePeriod: String(form["service_period"] ?? ""),
        });
        if (dup)
          throw new Error(
            `Für diesen Kunden existiert bereits die Rechnung ${dup.number} für den Leistungszeitraum ${dup.period}. Doppelte Abrechnung wurde verhindert.`,
          );
      }
    }

    const payload = {
      ...form,
      number,
      due_date: form["due_date"] ? form["due_date"] : null,
      paid_at: form["status"] === "paid" ? form["paid_at"] || today() : null,
      customer_id: form["customer_id"] || null,
      tax_mode: taxMode,
      vat_rate: vatRate,
      reverse_charge: taxMode === "eu_reverse_charge",
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      discount_reason: discountReason,
      net_total: netTotal,
      vat_amount: vatAmount,
      total: grossTotal,
    };

    const { error: docError } = await supabase
      .from("documents")
      .update(payload as never)
      .eq("id", id);
    if (docError) throw docError;

    const { error: delError } = await supabase
      .from("document_items")
      .delete()
      .eq("document_id", id);
    if (delError) throw delError;

    if (items.length > 0) {
      const { error: insError } = await supabase.from("document_items").insert(
        items.map((i, index) => ({
          document_id: id,
          user_id: userId,
          position: index + 1,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          is_optional: Boolean(i.is_optional),
        })),
      );
      if (insError) throw insError;
    }
  }, [
    data,
    form,
    items,
    id,
    taxMode,
    vatRate,
    discountPercent,
    discountAmount,
    discountReason,
    netTotal,
    vatAmount,
    grossTotal,
  ]);

  // Autosave greift auf die jeweils aktuellste Fassung zu, ohne den Timer neu zu starten.
  const persistRef = useRef(persistDocument);
  persistRef.current = persistDocument;

  const save = useMutation({
    mutationFn: () => persistDocument(),
    onSuccess: () => {
      toast.success("Gespeichert");
      // Verlässt der Beleg den Entwurfsstatus, wird die offizielle Nummer vergeben.
      void (async () => {
        if (String(form["status"] ?? "draft") !== "draft") {
          try {
            await ensureOfficialNumber(id);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["document", id] });
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
      })();
    },
    onError: (e: Error) =>
      toast.error(describeGobdError(e, data?.doc as unknown as Record<string, unknown>), {
        duration: 9000,
      }),
  });

  // Entwurf automatisch sichern – schonend: erst nach einer Schreibpause (Debounce)
  // oder geräuschlos beim Verlassen der Seite. Kein Speichern mitten beim Tippen.
  const AUTOSAVE_DELAY_MS = 4000;
  // Zugriff auf die jeweils aktuellen Server-Daten, ohne sie als Dependency
  // in den Debounce-Effect zu ziehen (kein Timer-Neustart durch Refetches).
  const dataRef = useRef(data);
  dataRef.current = data;
  // Verweis auf den aktuellen Flush, damit die Unload-Listener nur einmal
  // gemountet werden müssen und trotzdem stets die neueste Fassung sichern.
  const flushRef = useRef<() => void>(() => {});
  // Leere Entwürfe (nur Standardwerte) werden weder gespeichert noch behalten.
  const blankDraft = isEmptyDraft(form, items, baselineFormRef.current);
  const blankDraftRef = useRef(blankDraft);
  blankDraftRef.current = blankDraft;

  useEffect(() => {
    const serverData = dataRef.current;
    if (!serverData) return;
    const current = serverData.doc as unknown as Record<string, unknown>;
    if (isLockedDocument(current)) return;
    if (Object.keys(form).length === 0) return;
    if (isEmptyDraft(form, items, baselineFormRef.current)) {
      // Nichts eingegeben – kein Autosave, damit keine leere Karteileiche entsteht.
      flushRef.current = () => {};
      return;
    }
    const snapshot = JSON.stringify({ form, items });
    if (!savedSnapshotRef.current) {
      savedSnapshotRef.current = snapshot;
      return;
    }
    if (savedSnapshotRef.current === snapshot) return;

    // Vollkommen geräuschlose Hintergrund-Speicherung: kein Ladezustand,
    // kein Overlay, kein erneutes Befüllen der Eingabefelder.
    const flush = () => {
      if (savedSnapshotRef.current === snapshot) return;
      void persistRef
        .current()
        .then(() => {
          savedSnapshotRef.current = snapshot;
          setAutoSavedAt(
            new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
          );
        })
        .catch(() => {
          /* Fehler zeigt der manuelle Speichern-Button */
        });
    };
    flushRef.current = flush;
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [form, items]);

  // Unload-Listener genau einmal pro Beleg registrieren (Mount/Unmount) –
  // sie greifen über flushRef immer auf den neuesten Flush zu.
  useEffect(() => {
    const onPageHide = () => flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onBeforeUnload = () => flushRef.current();
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Beim Verlassen der Seite einen komplett leeren Entwurf wieder entfernen.
  useEffect(() => {
    return () => {
      if (!blankDraftRef.current) return;
      const current = dataRef.current?.doc as Record<string, unknown> | undefined;
      if (!current) return;
      if (isLockedDocument(current)) return;
      if (String(current["status"] ?? "draft") !== "draft") return;
      void (async () => {
        await supabase.from("document_items").delete().eq("document_id", id);
        const { error } = await supabase.from("documents").delete().eq("id", id);
        if (!error) await queryClient.invalidateQueries({ queryKey: ["documents"] });
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Bearbeitungsmodus merken, damit man an derselben Stelle weiterarbeitet.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `doc-edit:${id}`;
    if (bearbeiten) {
      window.localStorage.setItem(key, "1");
      return;
    }
    if (window.localStorage.getItem(key) === "1") setEditMode(true);
  }, [id, bearbeiten]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `doc-edit:${id}`;
    if (editMode) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  }, [id, editMode]);

  const duplicate = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const doc = data!.doc as Record<string, unknown>;
      // Entwurfsnummer (Platzhalter): die offizielle fortlaufende Nummer wird
      // erst beim Festschreiben vergeben – so entstehen keine Lücken (§ 14 UStG).
      const nextNr = draftPlaceholderNumber(String(doc["type"] ?? "invoice") as never);
      // Kopie startet mit aktuellem Datum und passendem Leistungsmonat.
      const issueDate = today();
      const period = periodForIssueDate(issueDate);
      const servicePeriod = period ? formatPeriod(period) : String(doc["service_period"] ?? "");
      const serviceDescription = period
        ? syncMonthInText(String(doc["service_description"] ?? ""), period.end)
        : String(doc["service_description"] ?? "");

      const {
        id: _id,
        created_at: _c,
        updated_at: _u,
        sent_at: _s,
        // GoBD-Felder dürfen niemals mitkopiert werden – die Kopie ist ein Entwurf.
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
      } = doc as unknown as Record<string, unknown>;

      const { data: created, error } = await supabase
        .from("documents")
        .insert({
          ...rest,
          user_id: userId,
          number: nextNr,
          status: "draft",
          issue_date: issueDate,
          due_date: null,
          service_period: servicePeriod,
          service_description: serviceDescription,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      if (items.length > 0) {
        await supabase.from("document_items").insert(
          items.map((i, index) => ({
            document_id: created.id,
            user_id: userId,
            position: index + 1,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            is_optional: Boolean(i.is_optional),
          })),
        );
      }
      return created.id as string;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Kopie erstellt");
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // GoBD: Beleg festschreiben (unveränderbar) + revisionssicher archivieren.
  const finalize = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      const finalized = await finalizeDocument(id);
      await queryClient.invalidateQueries({ queryKey: ["document", id] });
      // Kurz warten, damit die Druckansicht die neue Nummer zeigt.
      await new Promise((r) => setTimeout(r, 400));
      const bytes = await buildDocumentPdfBytes(await buildPdfData(finalized.number));
      await archiveDocumentPdf({ id, number: finalized.number }, bytes);
      return finalized.number;
    },
    onSuccess: (number) => {
      toast.success(`Festgeschrieben und archiviert: ${number}`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const storno = useMutation({
    mutationFn: (reason: string) => createStorno(id, reason),
    onSuccess: (newId) => {
      setStornoOpen(false);
      setStornoReason("");
      toast.success("Stornorechnung erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      navigate({ to: "/dokumente/$id", params: { id: newId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (isLockedDocument(docRecord)) throw new Error(deleteBlockedMessage(docRecord));
      // Verweise anderer Belege lösen, damit der Entwurf gelöscht werden kann
      await supabase
        .from("documents")
        .update({ converted_document_id: null })
        .eq("converted_document_id", id);
      await supabase
        .from("documents")
        .update({ cancels_document_id: null })
        .eq("cancels_document_id", id);
      await supabase
        .from("documents")
        .update({ cancelled_by_document_id: null })
        .eq("cancelled_by_document_id", id);
      await supabase
        .from("recurring_invoices")
        .update({ template_document_id: null })
        .eq("template_document_id", id);
      const { error } = await supabase.rpc("trash_entity", { _entity: "document", _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("In den Papierkorb verschoben – 30 Tage wiederherstellbar");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      navigate({ to: "/dokumente" });
    },
    onError: (e: unknown) => toast.error(describeGobdError(e, docRecord), { duration: 9000 }),
  });

  const markPaid = useMutation({
    mutationFn: (date: string) => markInvoicePaid(id, date),
    onSuccess: (paid) => {
      setForm((f) => ({ ...f, status: "paid", paid_at: paid }));
      toast.success(`Als bezahlt markiert (${formatDate(paid)})`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  // Zahlungsstatus ist bewusst von der GoBD-Sperre ausgenommen:
  // Der Zahlungseingang ändert keinen steuerlichen Rechnungsinhalt.
  const unmarkPaid = useMutation({
    mutationFn: () => unmarkInvoicePaid(id),
    onSuccess: () => {
      setForm((f) => ({ ...f, status: "sent", paid_at: null }));
      toast.success("Zahlung zurückgenommen – Rechnung gilt wieder als offen");
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const reminder = useMutation({
    mutationFn: (kind: ReminderKind) => sendReminder(id, kind),
    onSuccess: (level) => {
      toast.success(`${mahnLabel(level)} erfasst`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Manuelle Statuspflege ohne erneuten E-Mail-Versand.
  const setSendStatus = useMutation({
    mutationFn: async (next: "draft" | "sent") => {
      const { data, error } = await supabase
        .from("documents")
        .update({
          status: next,
          sent_at: next === "sent" ? new Date().toISOString() : null,
        } as never)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Beleg nicht gefunden");
      // Versand = echter Beleg: offizielle, fortlaufende Nummer vergeben.
      if (next === "sent") await ensureOfficialNumber(id);
      await logAudit(
        next === "sent" ? "marked_sent" : "marked_draft",
        { id, number: docNumber },
        {},
      );
      return next;
    },
    onSuccess: (next) => {
      setForm((f) => ({ ...f, status: next }));
      toast.success(
        next === "sent"
          ? "Status auf Versendet gesetzt – ohne erneute E-Mail an den Kunden."
          : "Status auf Entwurf zurückgesetzt.",
      );
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });

  const decide = useMutation({
    mutationFn: async (decision: "accepted" | "declined") => {
      await save.mutateAsync();
      const converted =
        decision === "accepted" && !form["customer_id"]
          ? await ensureCustomerForAcceptedQuote(id)
          : null;
      await setQuoteDecision(id, decision);
      return { decision, converted };
    },
    onSuccess: ({ decision, converted }) => {
      // Lokalen Status und ggf. neu verknüpften Kunden mitziehen, damit Autosave
      // nicht wieder den Interessenten-Zustand überschreibt.
      setForm((f) => ({
        ...f,
        status: decision,
        ...(converted ? { customer_id: converted.customerId } : {}),
      }));
      toast.success(
        converted?.created
          ? "Angebot angenommen – Interessent wurde als Kunde angelegt."
          : converted
            ? "Angebot angenommen – mit vorhandenem Kunden verknüpft."
            : "Angebotsstatus aktualisiert",
      );
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preparePlanning = useMutation({
    mutationFn: async () => {
      if (String(form["status"] ?? "") !== "accepted") {
        throw new Error("Bitte das Angebot zuerst als angenommen markieren.");
      }

      const hours = Number(form["planned_hours_month"] ?? 0);
      const visits = Number(form["planned_visits_month"] ?? 0);
      if (!(hours > 0) || !(visits > 0)) {
        throw new Error(
          "In diesem Angebot fehlen Soll-Stunden oder Einsätze pro Monat. Bitte eine neue Kalkulation übernehmen oder die Planung manuell im Dienstplan anlegen.",
        );
      }

      let customerId = String(form["customer_id"] ?? "").trim();
      if (!customerId) {
        const linked = await ensureCustomerForAcceptedQuote(id);
        customerId = linked?.customerId ?? "";
      }
      if (!customerId) throw new Error("Kein Kunde mit dem angenommenen Angebot verknüpft.");

      let projectId = String(form["project_id"] ?? "").trim();
      let created = false;

      if (!projectId) {
        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select(
            "id,name,company,email,phone,service_address_line,service_postal_code,service_city,address_line,postal_code,city",
          )
          .eq("id", customerId)
          .single();
        if (customerError) throw customerError;

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) throw new Error("Nicht angemeldet");

        const objectName = `${customer.company || customer.name || "Kunde"} – Objekt`;
        const addressLine = customer.service_address_line || customer.address_line || "";
        const postalCode = customer.service_postal_code || customer.postal_code || "";
        const city = customer.service_city || customer.city || "";

        const { data: project, error: projectError } = await supabase
          .from("projects")
          .insert({
            user_id: userId,
            name: objectName,
            mode: "floorplan",
            customer_id: customer.id,
            customer_name: customer.company || customer.name || "",
            contact_email: customer.email || "",
            contact_phone: customer.phone || "",
            address_line: addressLine,
            postal_code: postalCode,
            city,
          })
          .select("id")
          .single();
        if (projectError) throw projectError;

        projectId = project.id;
        created = true;

        const { error: linkError } = await supabase
          .from("documents")
          .update({ project_id: projectId } as never)
          .eq("id", id);
        if (linkError) throw linkError;
      }

      return { projectId, hours, visits, created };
    },
    onSuccess: ({ projectId, hours, visits, created }) => {
      setForm((current) => ({ ...current, project_id: projectId }));
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (created) toast.success("Objekt angelegt – Einsatzplanung wird vorbereitet.");
      navigate({
        to: "/team",
        search: {
          tab: "dienstplan",
          projekt: projectId,
          stunden: hours,
          einsaetze: visits,
        },
      });
    },
    onError: (e: Error) => toast.error(e.message, { duration: 9000 }),
  });

  const convert = useMutation({
    mutationFn: (): Promise<string> =>
      data?.doc.type === "order" ? convertOrderToInvoice(id) : convertQuoteToOrder(id),
    onSuccess: (newId: string) => {
      toast.success(
        data?.doc.type === "order"
          ? "Rechnung aus Auftragsbestätigung erstellt"
          : "Auftragsbestätigung aus Angebot erstellt",
      );
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Angebot direkt abrechnen (einmalige Dienstleistung, ohne Auftragsbestätigung).
  const quoteToInvoice = useMutation({
    mutationFn: (): Promise<string> => convertQuoteToInvoice(id),
    onSuccess: (newId: string) => {
      toast.success("Rechnung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return null;
  }

  const doc = data.doc;
  const docRecord = doc as unknown as Record<string, unknown>;
  const lockedAt = (docRecord["locked_at"] as string | null) ?? null;
  const locked = Boolean(lockedAt);
  // A finalized invoice is not proof of successful email delivery.
  const emailPending =
    doc.type === "invoice" && locked && !docRecord["sent_at"] && doc.status === "sent";
  const isStorno = Boolean(docRecord["is_storno"]);
  const cancelledBy = (docRecord["cancelled_by_document_id"] as string | null) ?? null;
  const relatedDoc = (data as { related?: Record<string, unknown> | null }).related ?? null;
  // Stornogrund steht am Stornobeleg – für die Originalrechnung wird er dort gelesen.
  const stornoGrund = String(
    (isStorno ? docRecord["storno_reason"] : relatedDoc?.["storno_reason"]) ?? "",
  ).trim();
  const stornoNumber = String(relatedDoc?.["number"] ?? "").trim();
  const settings = data.settings as Record<string, string | number | null> | null;
  const isInvoice = doc.type === "invoice";
  const isOrder = doc.type === "order";
  const isQuote = doc.type === "quote";
  const reminderLevel = Number(docRecord["reminder_level"] ?? 0);
  const canMahnen = mahnungAllowed(docRecord["due_date"] as string | null);

  const convertedId = (docRecord["converted_document_id"] as string | null) ?? null;
  const plannedHoursMonth = Number(
    docRecord["planned_hours_month"] ?? form["planned_hours_month"] ?? 0,
  );
  const plannedVisitsMonth = Number(
    docRecord["planned_visits_month"] ?? form["planned_visits_month"] ?? 0,
  );
  const followUpDoc =
    (data as { followUp?: { id: string; number: string; type: string } | null }).followUp ?? null;
  const sourceDoc =
    (
      data as {
        source?: { id: string; number: string; type: string; issue_date?: string } | null;
      }
    ).source ?? null;
  const due = dueInfo(doc.due_date, doc.status);
  const docNumber = doc.number;
  const introText = String(form["intro_text"] ?? "").trim();
  // Datumsprüfung: Rechnungsdatum darf nicht vor der Leistung liegen (§ 14 UStG).
  const dateCheck = isInvoice
    ? checkInvoiceDates(String(form["issue_date"] ?? ""), String(form["service_period"] ?? ""))
    : { level: "ok" as const, message: "" };

  const senderLine = buildDocumentSenderLine(settings as Record<string, unknown> | null);

  function setField(key: string, value: string | boolean | null) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Status "Bezahlt" und Zahlungsdatum bleiben automatisch synchron.
      if (key === "status") {
        if (value === "paid" && !next["paid_at"]) next["paid_at"] = today();
        if (value !== "paid") next["paid_at"] = null;
      }
      if (key === "paid_at" && value) next["status"] = "paid";
      // Monats-Synchronisierung: Leistungszeitraum folgt automatisch dem
      // Rechnungsdatum, solange noch kein Zeitraum gepflegt wurde.
      if (key === "issue_date" && typeof value === "string" && doc.type === "invoice") {
        const period = periodForIssueDate(value);
        if (period && !String(next["service_period"] ?? "").trim()) {
          next["service_period"] = formatPeriod(period);
        }
        const desc = String(next["service_description"] ?? "");
        if (desc) next["service_description"] = syncMonthInText(desc, value);
      }
      return next;
    });
  }

  /** Übernimmt den Monat des Rechnungsdatums als Leistungszeitraum. */
  function applyIssueMonth() {
    const period = periodForIssueDate(String(form["issue_date"] ?? ""));
    if (!period) return;
    setForm((f) => ({
      ...f,
      service_period: formatPeriod(period),
      service_description: syncMonthInText(String(f["service_description"] ?? ""), period.start),
    }));
  }

  function pickCustomer(customerId: string) {
    const c = data!.customers.find((x) => x.id === customerId);
    if (!c) return;
    setQuoteRecipientMode("kunde");
    // Reverse-Charge greift nur bei EU-Kunden MIT gültiger USt-IdNr. (§ 13b UStG / Art. 196 MwStSystRL)
    const euReverseCharge =
      Boolean((c as { is_eu_customer?: boolean }).is_eu_customer) && Boolean(c.vat_id?.trim());
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      project_id: data!.projects.some(
        (p) => p.id === String(f["project_id"] ?? "") && p.customer_id === c.id,
      )
        ? String(f["project_id"] ?? "")
        : null,
      customer_type: c.company?.trim() ? "firma" : "privat",
      customer_number: (c as { customer_number?: string }).customer_number ?? "",

      customer_name: c.name,
      customer_company: c.company,
      customer_email: c.email,
      customer_phone: c.phone,
      customer_address_line: c.address_line,
      customer_postal_code: c.postal_code,
      customer_city: c.city,
      customer_country: c.country,
      customer_vat_id: c.vat_id,
      tax_mode:
        String(f["tax_mode"] ?? "") === "kleinunternehmer"
          ? "kleinunternehmer"
          : euReverseCharge && reverseChargeAllowed
            ? "eu_reverse_charge"
            : "domestic",
    }));
  }

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const mail = buildDocumentMail({
    documentType: doc.type,
    documentNumber: docNumber,
    issueDate: String(form["issue_date"] ?? doc.issue_date),
    dueDate: String(form["due_date"] ?? ""),
    customerEmail: String(form["customer_email"] ?? ""),
    settings,
  });

  const paymentTermsDays = Number(settings?.["payment_terms_days"] ?? 14);

  const iban = String(settings?.["iban"] ?? "");
  const bic = String(settings?.["bic"] ?? "");

  const epc = isInvoice
    ? buildEpcPayload({
        name: String(settings?.["company_name"] ?? ""),
        iban,
        bic,
        amount: grossTotal,
        reference: `${DOC_TYPE_LABEL[doc.type]} ${docNumber}`,
      })
    : null;

  // ---- E-Rechnung (XRechnung / ZUGFeRD) ----------------------------------
  function eRechnungInput(numberOverride?: string): ERechnungInput {
    const number = numberOverride ?? docNumber;
    return {
      doc: { ...docRecord, ...form, number },
      items,
      settings: settings as Record<string, unknown> | null,
      netTotal,
      vatAmount,
      grossTotal,
      vatRate,
      number,
    };
  }

  function warnIfIncomplete(input: ERechnungInput, format: "xrechnung" | "zugferd" = "zugferd") {
    const problems = validateERechnung(input, format);
    if (problems.length > 0) {
      throw new Error(problems.join(" "));
    }
  }

  /**
   * Vor jeder verbindlichen Ausgabe (Versand, E-Rechnung) die offizielle,
   * fortlaufende Nummer vergeben – der Kunde darf nie eine DEMO-Nummer erhalten.
   */
  async function assignOfficialNumberNow(): Promise<string> {
    if (locked || !isDraftPlaceholder(docNumber)) return docNumber;
    const number = await ensureOfficialNumber(id);
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
    await queryClient.refetchQueries({ queryKey: ["document", id] });
    return number;
  }

  async function exportXRechnung() {
    try {
      if (!ensureHasItems()) return;
      if (!(await persistBeforeOutput())) return;
      const number = await assignOfficialNumberNow();
      const input = eRechnungInput(number);
      warnIfIncomplete(input, "xrechnung");
      downloadXml(buildXRechnungXml(input), `XRechnung_${number.replace(/\W+/g, "_")}.xml`);
      await logAudit("xrechnung_export", { id, number }, { format: "XRechnung 3.0 (UBL)" });
      toast.success("XRechnung (XML) erstellt");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Alle Belegdaten für die bibliotheksbasierte PDF-Erzeugung (pdf-lib) sammeln. */
  async function buildPdfData(numberOverride?: string): Promise<PdfDocData> {
    const number = numberOverride ?? docNumber;
    const companyName = String(settings?.["company_name"] ?? "");

    const meta: Array<{ label: string; value: string }> = [];
    if (form["customer_number"])
      meta.push({ label: "Kundennummer", value: String(form["customer_number"]) });
    meta.push({
      label: isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer",
      value: number,
    });
    meta.push({
      label: isInvoice ? "Rechnungsdatum" : "Datum",
      value: formatDate(String(form["issue_date"] ?? "")),
    });
    if (form["service_period"])
      meta.push({ label: "Leistungszeitraum", value: String(form["service_period"]) });
    if (form["due_date"])
      meta.push({
        label: isInvoice ? "Fällig am" : "Gültig bis",
        value: formatDate(String(form["due_date"])),
      });
    if (!isPrivat && form["order_number"])
      meta.push({ label: "Bestellnummer", value: String(form["order_number"]) });
    // Referenz auf den Quellbeleg (Angebot bzw. Auftragsbestätigung) – § 14 UStG.
    if (sourceDoc) {
      const refLabel =
        sourceDoc.type === "quote"
          ? "Angebot"
          : sourceDoc.type === "order"
            ? "Auftragsbestätigung"
            : "Referenz";
      meta.push({
        label: refLabel,
        value: sourceDoc.issue_date
          ? `${sourceDoc.number} vom ${formatDate(String(sourceDoc.issue_date))}`
          : sourceDoc.number,
      });
    }

    const summary: PdfDocData["summary"] = [];
    if (discountPercent > 0) {
      summary.push({ label: "Zwischensumme (netto)", value: formatMoney(itemsTotal) });
      summary.push({
        label: `Rabatt ${formatNumber(discountPercent)} %${discountReason ? ` – ${discountReason}` : ""}`,
        value: `−${formatMoney(discountAmount)}`,
      });
    }
    summary.push({ label: "Nettobetrag (Summe netto)", value: formatMoney(netTotal) });
    summary.push({
      label: `zzgl. Umsatzsteuer ${formatNumber(vatRate)} %`,
      value: formatMoney(vatAmount),
    });
    summary.push({
      label: vatRate > 0 ? "Bruttobetrag (inkl. MwSt.)" : "Gesamtbetrag",
      value: formatMoney(grossTotal),
      strong: true,
      rule: true,
    });

    const customTitle = String(form["title"] ?? "").trim();
    const autoTitle = `${isStorno ? "Stornorechnung" : DOC_TYPE_LABEL[doc.type]} ${number}`;

    return {
      isInvoice,
      // Auch bei Rechnungen ersetzt ein frei eingetragener Titel die
      // automatische Überschrift; die Nummer bleibt im Belegkopf sichtbar.
      title: isInvoice && customTitle ? customTitle : autoTitle,

      // Sichtbarer Stempel bei Stornobeleg und bei stornierter Originalrechnung.
      ...(isStorno || cancelledBy || doc.status === "cancelled"
        ? {
            watermark: "STORNO",
            ...(stornoGrund || stornoNumber
              ? {
                  watermarkNote: [
                    isStorno
                      ? stornoNumber
                        ? `Storno zu ${stornoNumber}`
                        : ""
                      : stornoNumber
                        ? `Storniert durch ${stornoNumber}`
                        : "",
                    stornoGrund ? `Grund: ${stornoGrund}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }
              : {}),
          }
        : {}),

      ...(isInvoice
        ? {}
        : {
            // Frei eingetragener Titel hat Vorrang vor der automatisch
            // erzeugten Überschrift (Logik bleibt als Fallback erhalten).
            headline: String(form["title"] ?? "").trim()
              ? String(form["title"]).trim()
              : (isOrder ? orderHeadline : quoteHeadline)(
                  deriveServiceName(
                    form["service_description"] ? String(form["service_description"]) : "",
                    items[0]?.description ?? "",
                  ),
                ),
          }),
      logo: (await loadDocumentLogo(logoSrc)) ?? null,
      logoInitials: companyName
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join(""),
      companyName,
      ownerName: settings?.["owner_name"] ? String(settings["owner_name"]) : undefined,
      contactEmail: settings?.["email"] ? String(settings["email"]) : undefined,
      contactPhone: settings?.["phone"] ? String(settings["phone"]) : undefined,
      senderLine,
      customer: [
        ...(isPrivat ? [] : [String(form["customer_company"] ?? "")]),
        String(form["customer_name"] ?? ""),
        String(form["customer_address_line"] ?? ""),
        `${String(form["customer_postal_code"] ?? "")} ${String(form["customer_city"] ?? "")}`.trim(),
        String(form["customer_country"] ?? ""),
      ],
      customerVatId:
        !isPrivat && form["customer_vat_id"] ? String(form["customer_vat_id"]) : undefined,
      meta,
      introText: isInvoice
        ? introText || INVOICE_INTRO
        : isQuote
          ? introText || defaultQuoteIntro(isPrivat, companyName)
          : `${ORDER_INTRO}${introText ? `\n\n${introText}` : ""}`,

      items: (hasOptionalItems
        ? [...items.filter((i) => !i.is_optional), ...items.filter((i) => i.is_optional)]
        : items
      ).map((i) => ({
        description: i.description,
        quantity: formatNumber(i.quantity),
        unit: i.unit,
        unitPrice: formatMoney(i.unit_price),
        total: formatMoney(i.quantity * i.unit_price),
        optional: Boolean(i.is_optional),
      })),
      regularSubtotal: formatMoney(regularTotal),
      optionalNote: OPTIONAL_NOTE,
      serviceDescription:
        !isInvoice && form["service_description"] ? String(form["service_description"]) : undefined,
      summary,
      taxNote: taxNote || undefined,
      notes: isInvoice
        ? form["notes"]
          ? String(form["notes"])
          : undefined
        : [
            form["notes"] ? String(form["notes"]) : "",
            isOrder ? "" : QUOTE_DISCLAIMER,
            isOrder ? CANCELLATION_TERMS : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
      // Bankdaten stehen bereits im Fußbereich – hier nicht wiederholen.
      paymentLines: isInvoice
        ? [
            `Zahlüberweisung in ${paymentTermsDays} Tagen`,
            "Vielen Dank für die gute Zusammenarbeit.",
          ]
        : [`Zahlüberweisung in ${paymentTermsDays} Tagen`],

      qrPayload: epc,
      footer: [
        {
          heading: companyName,
          lines: [
            String(settings?.["address_line"] ?? ""),
            `${String(settings?.["postal_code"] ?? "")} ${String(settings?.["city"] ?? "")}`.trim(),
            settings?.["phone"] ? `Tel. ${String(settings["phone"])}` : "",
            settings?.["email"] ? String(settings["email"]) : "",
          ],
        },
        {
          heading: "Steuerangaben",
          lines: [
            `USt-IdNr.: ${String(settings?.["vat_id"] ?? "")}`,
            `Steuernummer: ${String(settings?.["tax_number"] ?? "")}`,
            settings?.["owner_name"] ? `Inhaber: ${String(settings["owner_name"])}` : "",
          ],
        },
        {
          heading: "Bankverbindung",
          lines: [
            String(settings?.["bank_name"] ?? ""),
            `IBAN ${String(settings?.["iban"] ?? "")}`,
            `BIC ${String(settings?.["bic"] ?? "")}`,
          ],
        },
      ],
    };
  }

  /**
   * Vor jeder Ausgabe (PDF, E-Rechnung, Versand) den aktuellen Bearbeitungsstand
   * verbindlich speichern. Sonst kann ein PDF Positionen enthalten, die in der
   * Datenbank (und damit in Vorschau/Übersicht/Portal) gar nicht existieren.
   */
  async function persistBeforeOutput(): Promise<boolean> {
    if (locked) return true;
    try {
      await save.mutateAsync();
      return true;
    } catch {
      // Fehlermeldung kommt bereits aus der Mutation.
      return false;
    }
  }

  /** Versand/Festschreiben ohne Positionen verhindert leere Belege (§ 14 UStG). */
  function ensureHasItems(): boolean {
    if (items.length > 0) return true;
    toast.error("Der Beleg enthält keine Positionen. Bitte zuerst Positionen erfassen.", {
      duration: 8000,
    });
    return false;
  }

  async function exportZugferd() {
    if (!ensureHasItems()) return;
    if (!(await persistBeforeOutput())) return;
    const toastId = toast.loading("ZUGFeRD-PDF wird erzeugt…");
    try {
      const number = await assignOfficialNumberNow();
      const input = eRechnungInput(number);
      warnIfIncomplete(input);
      const pdfBytes = await buildDocumentPdfBytes(await buildPdfData(number));
      const hybrid = await embedZugferdXml(pdfBytes, buildZugferdXml(input), {
        number,
        title: DOC_TYPE_LABEL[doc.type] ?? "Rechnung",
      });
      downloadBytes(hybrid, `ZUGFeRD_${number.replace(/\W+/g, "_")}.pdf`);
      await logAudit(
        "zugferd_export",
        { id, number },
        { format: "ZUGFeRD 2.3 / Factur-X (EN 16931)" },
      );
      toast.success("ZUGFeRD-PDF (hybride E-Rechnung) erstellt", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message, { id: toastId });
    }
  }

  /**
   * Einzige PDF-Quelle der Wahrheit: Vorschau, Download und E-Mail-Anhang
   * verwenden ausschließlich diese Funktion mit denselben Daten.
   */
  async function makePdfBytes(): Promise<Uint8Array> {
    return buildDocumentPdfBytes(await buildPdfData());
  }

  /** Fertiges Dokument direkt als A4-PDF herunterladen (pdf-lib, kein Browser-Druck). */
  async function downloadPdf() {
    if (!(await persistBeforeOutput())) return;
    const toastId = toast.loading("PDF wird erzeugt…");
    try {
      const bytes = await makePdfBytes();
      downloadBytes(
        bytes,
        `${DOC_TYPE_LABEL[doc.type]}-${docNumber.replace(/\W+/g, "_")}.pdf`.replace(/\s+/g, "-"),
      );
      toast.success("PDF heruntergeladen", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message, { id: toastId });
    }
  }

  return {
    applyIssueMonth,
    assignOfficialNumberNow,
    autoSavedAt,
    canMahnen,
    cancelledBy,
    confirmDialog,
    convert,
    convertedId,
    data,
    dateCheck,
    decide,
    discountAmount,
    discountItemPresent,
    discountPercent,
    discountReason,
    doc,
    docNumber,
    docRecord,
    downloadPdf,
    due,
    duplicate,
    editMode,
    emailPending,
    ensureHasItems,
    epc,
    exportXRechnung,
    exportZugferd,
    finalize,
    followUpDoc,
    form,
    grossTotal,
    hasOptionalItems,
    id,
    introText,
    isInvoice,
    isOrder,
    isPrivat,
    isQuote,
    isSmallBusiness,
    isStorno,
    items,
    itemsTotal,
    locked,
    lockedAt,
    logoSrc,
    mail,
    mailOpen,
    makePdfBytes,
    markPaid,
    netTotal,
    payDate,
    payOpen,
    paymentTermsDays,
    persistBeforeOutput,
    pickCustomer,
    plannedHoursMonth,
    plannedVisitsMonth,
    preparePlanning,
    queryClient,
    quoteRecipientMode,
    quoteToInvoice,
    regularTotal,
    reminder,
    reminderLevel,
    remove,
    reverseChargeAllowed,
    save,
    senderLine,
    setConfirmDialog,
    setEditMode,
    setField,
    setForm,
    setItems,
    setMailOpen,
    setPayDate,
    setPayOpen,
    setQuoteRecipientMode,
    setSendStatus,
    setStornoOpen,
    setStornoReason,
    settings,
    sourceDoc,
    storno,
    stornoGrund,
    stornoNumber,
    stornoOpen,
    stornoReason,
    taxMode,
    taxNote,
    unmarkPaid,
    updateItem,
    vatAmount,
    vatRate,
  };
}

export type DocumentDetailStateContext = NonNullable<ReturnType<typeof useDocumentDetailState>>;
