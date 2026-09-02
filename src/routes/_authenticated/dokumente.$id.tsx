import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  formatNumber,
  roundCents,
  taxNoteForTaxMode,
  today,
  vatRateForTaxMode,
} from "@/lib/format";
import { Sparkles } from "lucide-react";
import { useCanReverseCharge } from "@/lib/subscriptions";
import { buildEpcPayload } from "@/lib/epc";
import {
  QUOTE_DISCLAIMER,
  CANCELLATION_TERMS,
  ORDER_INTRO,
  INVOICE_INTRO,
  orderHeadline,
  quoteIntro,
  deriveServiceName,
  quoteHeadline,
} from "@/lib/document-texts";
import { GiroCode } from "@/components/GiroCode";
import { DateRangeField } from "@/components/DateRangeField";
import { SendEmailDialog } from "@/components/SendEmailDialog";
import { buildSignatureHtml } from "@/lib/signature";
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
import { parseGermanDate } from "@/lib/format";
import {
  checkInvoiceDates,
  formatPeriod,
  periodForIssueDate,
  syncMonthInText,
} from "@/lib/invoice-period";
import { findDuplicateInvoice } from "@/lib/invoice-duplicate";

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
import {
  ArrowLeft,
  ArrowRightLeft,
  BadgeEuro,
  Ban,
  BellRing,
  Check,
  Copy,
  FileCode2,
  FileDown,
  Lock,
  Mail,
  Pencil,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dokumente/$id")({
  validateSearch: (search: Record<string, unknown>): { bearbeiten?: boolean } =>
    search["bearbeiten"] === true || search["bearbeiten"] === "1" ? { bearbeiten: true } : {},

  head: () => ({
    meta: [
      { title: "Beleg-Vorschau – Rechnungen & Angebote" },
      {
        name: "description",
        content:
          "Fertiges Dokument als saubere A4-Vorschau ansehen, als PDF herunterladen, drucken oder per E-Mail senden.",
      },
      { property: "og:title", content: "Beleg-Vorschau" },
      { property: "og:description", content: "Rechnung oder Angebot ansehen, drucken und senden." },
    ],
  }),
  component: DokumentDetail,
});

type Item = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_optional?: boolean;
};

/** Hinweis unter den optionalen Zusatzleistungen (Angebotsstruktur). */
const OPTIONAL_NOTE = "Zusatzleistungen werden nur bei tatsächlicher Durchführung berechnet.";

/** Standard-Nettostundensatz (29,41 € netto ≈ 35,00 € brutto bei 19 % MwSt.). */
const DEFAULT_NET_RATE = 29.41;
const UNIT_OPTIONS: string[] = ["Std.", "m²", "Pauschal", "Karton", "Kanister / Gallone"];

function DokumentDetail() {
  const { id } = Route.useParams();
  const { bearbeiten } = Route.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Standard ist die saubere Vorschau; Bearbeiten wird bewusst geöffnet.
  const [editMode, setEditMode] = useState(Boolean(bearbeiten));

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const [doc, items, settings, customers] = await Promise.all([
        supabase.from("documents").select("*").eq("id", id).single(),
        supabase
          .from("document_items")
          .select("*")
          .eq("document_id", id)
          .order("position", { ascending: true }),
        supabase.from("company_settings").select("*").maybeSingle(),
        supabase.from("customers").select("*").order("company", { ascending: true }),
      ]);
      if (doc.error) throw doc.error;
      // Zugehöriger Storno-/Originalbeleg: Nummer und Stornogrund für Hinweis und PDF.
      const rec = doc.data as unknown as Record<string, unknown>;
      const relatedId =
        (rec["cancelled_by_document_id"] as string | null) ??
        (rec["cancels_document_id"] as string | null) ??
        null;
      const related = relatedId
        ? (
            await supabase
              .from("documents")
              .select("id, number, storno_reason, is_storno")
              .eq("id", relatedId)
              .maybeSingle()
          ).data
        : null;
      // Folgebeleg (aus diesem Beleg erzeugt) und Quellbeleg (dieser Beleg wurde daraus erzeugt).
      const followUpId = (rec["converted_document_id"] as string | null) ?? null;
      const [followUpRes, sourceRes] = await Promise.all([
        followUpId
          ? supabase
              .from("documents")
              .select("id, number, type, issue_date")
              .eq("id", followUpId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("documents")
          .select("id, number, type, issue_date")
          .eq("converted_document_id", id)
          .maybeSingle(),
      ]);
      return {
        doc: doc.data,
        related,
        followUp: followUpRes.data ?? null,
        source: sourceRes.data ?? null,
        items: (items.data ?? []) as Item[],
        settings: settings.data,
        customers: customers.data ?? [],
      };
    },
  });

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    action: () => void;
  } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stornoOpen, setStornoOpen] = useState(false);
  const [stornoReason, setStornoReason] = useState("");

  const [payDate, setPayDate] = useState<string>("");
  // Autosave: letzte gespeicherte Fassung als Vergleichs-Fingerabdruck.
  const savedSnapshotRef = useRef<string>("");
  const [autoSavedAt, setAutoSavedAt] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    const d = data.doc as Record<string, unknown>;
    setForm({
      number: String(d["number"] ?? ""),
      order_number: String(d["order_number"] ?? ""),
      status: String(d["status"] ?? "draft"),
      issue_date: String(d["issue_date"] ?? ""),
      due_date: (d["due_date"] as string) ?? "",
      service_period: String(d["service_period"] ?? ""),
      tax_mode: String(d["tax_mode"] ?? "eu_reverse_charge"),
      customer_id: (d["customer_id"] as string) ?? null,
      customer_number: String(d["customer_number"] ?? ""),

      customer_name: String(d["customer_name"] ?? ""),
      customer_company: String(d["customer_company"] ?? ""),
      customer_email: String(d["customer_email"] ?? ""),
      customer_address_line: String(d["customer_address_line"] ?? ""),
      customer_postal_code: String(d["customer_postal_code"] ?? ""),
      customer_city: String(d["customer_city"] ?? ""),
      customer_country: String(d["customer_country"] ?? ""),
      customer_vat_id: String(d["customer_vat_id"] ?? ""),
      intro_text: String(d["intro_text"] ?? ""),
      title: String(d["title"] ?? ""),
      service_description: String(d["service_description"] ?? ""),
      discount_percent: String(d["discount_percent"] ?? "0"),
      discount_reason: String(d["discount_reason"] ?? ""),

      notes: String(d["notes"] ?? ""),
      attachment_title: String(d["attachment_title"] ?? ""),
      attachment_text: String(d["attachment_text"] ?? ""),
    });

    setItems(
      data.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        is_optional: Boolean((i as unknown as Record<string, unknown>)["is_optional"]),
      })),
    );
    savedSnapshotRef.current = "";
  }, [data]);


  const { canReverseCharge, isLoading: planLoading } = useCanReverseCharge();
  const isSmallBusiness = Boolean(
    (data?.settings as Record<string, unknown> | null | undefined)?.["small_business"],
  );
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

  const itemsTotal = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );
  const hasOptionalItems = useMemo(() => items.some((i) => i.is_optional), [items]);
  const regularTotal = useMemo(
    () =>
      items
        .filter((i) => !i.is_optional)
        .reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(String(form["discount_percent"] ?? "0").replace(",", ".")) || 0),
  );
  const discountAmount = roundCents((itemsTotal * discountPercent) / 100);
  const discountReason = String(form["discount_reason"] ?? "");
  const netTotal = roundCents(itemsTotal - discountAmount);
  const vatAmount = roundCents((netTotal * vatRate) / 100);
  const grossTotal = roundCents(netTotal + vatAmount);

  /** Schreibt Kopf und Positionen des Belegs in die Datenbank (Speichern + Autosave). */
  const persistDocument = useCallback(
    async () => {
      const current = data?.doc as unknown as Record<string, unknown> | undefined;
      // Schutz: echte Belege (versendet/festgeschrieben) dürfen nie überschrieben werden.
      if (isLockedDocument(current)) throw new Error(editBlockedMessage(current));
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      // Nummern werden automatisch/fortlaufend vergeben und nie aus dem Formular übernommen.
      const number = String((data?.doc as { number?: string } | undefined)?.number ?? "").trim();
      if (!number) throw new Error("Beleg konnte nicht geladen werden.");

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
    },
    [
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
    ],
  );

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
  useEffect(() => {
    if (!data) return;
    const current = data.doc as unknown as Record<string, unknown>;
    if (isLockedDocument(current)) return;
    if (Object.keys(form).length === 0) return;
    const snapshot = JSON.stringify({ form, items });
    if (!savedSnapshotRef.current) {
      savedSnapshotRef.current = snapshot;
      return;
    }
    if (savedSnapshotRef.current === snapshot) return;

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

    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    // Beim Schließen/Verlassen der Seite, Tab-Wechsel oder vor dem Entladen sofort sichern.
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBeforeUnload = () => flush();
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [form, items, data]);

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
    mutationFn: (decision: "accepted" | "declined") => setQuoteDecision(id, decision),
    onSuccess: () => {
      toast.success("Angebotsstatus aktualisiert");
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
    return <p className="text-muted-foreground">Wird geladen…</p>;
  }

  const doc = data.doc;
  const docRecord = doc as unknown as Record<string, unknown>;
  const lockedAt = (docRecord["locked_at"] as string | null) ?? null;
  const locked = Boolean(lockedAt);
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

  const senderLine = [
    settings?.["company_name"] ?? "",
    settings?.["address_line"] ?? "",
    `${settings?.["postal_code"] ?? ""} ${settings?.["city"] ?? ""}`.trim(),
  ]
    .filter(Boolean)
    .join(", ");

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
    // Reverse-Charge greift nur bei EU-Kunden MIT gültiger USt-IdNr. (§ 13b UStG / Art. 196 MwStSystRL)
    const euReverseCharge =
      Boolean((c as { is_eu_customer?: boolean }).is_eu_customer) && Boolean(c.vat_id?.trim());
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      customer_number: (c as { customer_number?: string }).customer_number ?? "",

      customer_name: c.name,
      customer_company: c.company,
      customer_email: c.email,
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

  function buildMail() {
    const to = String(form["customer_email"] ?? "");
    const label = DOC_TYPE_LABEL[doc.type];
    const subject = `${label} ${docNumber} – ${settings?.["company_name"] ?? ""}`;
    const baseLines = [
      `Sehr geehrte Damen und Herren,`,
      ``,
      `im Anhang finden Sie ${
        isInvoice ? "unsere Rechnung" : isOrder ? "unsere Auftragsbestätigung" : "unser Angebot"
      } ${docNumber} vom ${formatDate(String(form["issue_date"] ?? doc.issue_date))} als PDF-Dokument.`,
      isInvoice && form["due_date"]
        ? `Wir bitten um Begleichung des Rechnungsbetrags bis zum ${formatDate(String(form["due_date"]))} ohne Abzug.`
        : "",
      ``,
      `Alle Einzelheiten entnehmen Sie bitte dem beigefügten PDF. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.`,
      ``,
      `Mit freundlichen Grüßen`,
    ].filter(Boolean);

    const signatureText = [
      String(settings?.["email_signature"] ?? "") ||
        [settings?.["company_name"] ?? "", settings?.["phone"] ?? ""].filter(Boolean).join("\n"),
      settings?.["website_url"] ? String(settings["website_url"]) : "",
      settings?.["facebook_url"] ? String(settings["facebook_url"]) : "",
    ]
      .filter(Boolean)
      .join("\n");

    const baseText = baseLines.join("\n");

    return {
      to,
      subject,
      body: baseText,
      signatureText,
      signatureHtml: buildSignatureHtml(settings as Record<string, unknown>),
    };
  }

  const mail = buildMail();

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

  function warnIfIncomplete(input: ERechnungInput) {
    const problems = validateERechnung(input);
    if (problems.length > 0) {
      toast.warning("Pflichtangaben unvollständig", { description: problems.join(" ") });
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
      const number = await assignOfficialNumberNow();
      const input = eRechnungInput(number);
      warnIfIncomplete(input);
      downloadXml(buildXRechnungXml(input), `XRechnung_${number.replace(/\W+/g, "_")}.xml`);
      await logAudit("xrechnung_export", { id, number }, { format: "XRechnung 3.0 (UBL)" });
      toast.success("XRechnung (XML) erstellt");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Logo für die PDF-Erzeugung laden (optional – ohne Logo wird ein Kürzel gesetzt). */
  async function loadLogo(): Promise<PdfDocData["logo"]> {
    if (!logoSrc) return null;
    try {
      const response = await fetch(logoSrc);
      if (!response.ok) return null;
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const isJpg = /jpe?g/i.test(blob.type) || bytes[0] === 0xff;
      return { bytes, type: isJpg ? "jpg" : "png" };
    } catch {
      return null;
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
    if (form["order_number"])
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

    return {
      isInvoice,
      title: `${isStorno ? "Stornorechnung" : DOC_TYPE_LABEL[doc.type]} ${number}`,
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
      logo: (await loadLogo()) ?? null,
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
        String(form["customer_company"] ?? ""),
        String(form["customer_name"] ?? ""),
        String(form["customer_address_line"] ?? ""),
        `${String(form["customer_postal_code"] ?? "")} ${String(form["customer_city"] ?? "")}`.trim(),
        String(form["customer_country"] ?? ""),
      ],
      customerVatId: form["customer_vat_id"] ? String(form["customer_vat_id"]) : undefined,
      meta,
      introText: isInvoice
        ? introText || INVOICE_INTRO
        : `${isOrder ? ORDER_INTRO : quoteIntro(companyName)}${
            introText ? `\n\n${introText}` : ""
          }`,

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

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dokumente">
            <ArrowLeft className="size-4" /> Zurück
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void downloadPdf()}>
            <FileDown className="size-4" /> PDF herunterladen
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Drucken
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                if (!ensureHasItems()) return;
                if (!(await persistBeforeOutput())) return;
                // Offizielle Nummer VOR dem Versand vergeben, damit PDF,
                // Dateiname und E-Mail-Text nie eine DEMO-Nummer enthalten.
                try {
                  await assignOfficialNumberNow();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
                  return;
                }
                setMailOpen(true);
              })();
            }}
          >
            <Mail className="size-4" /> Per E-Mail senden
          </Button>
          {doc.status === "draft" && (
            <Button
              variant="outline"
              title="Beleg als versendet kennzeichnen, ohne eine E-Mail zu verschicken"
              onClick={() => {
                void (async () => {
                  if (!ensureHasItems()) return;
                  if (!(await persistBeforeOutput())) return;
                  await setSendStatus.mutateAsync("sent");
                  // Mit dem Versand wird aus dem Entwurf ein echter Beleg:
                  // offizielle, fortlaufende Nummer vergeben (statt DEMO-Platzhalter).
                  try {
                    await ensureOfficialNumber(id);
                    await queryClient.invalidateQueries({ queryKey: ["document", id] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
                  }
                  // GoBD: Rechnungen werden beim Versand automatisch festgeschrieben.
                  if (isInvoice) {
                    try {
                      await finalize.mutateAsync();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Festschreiben fehlgeschlagen");
                    }
                  }
                })();
              }}
              disabled={setSendStatus.isPending || save.isPending}
            >
              <Check className="size-4" /> Als versendet markieren
            </Button>
          )}
          {doc.status === "sent" && !locked && (
            <Button
              variant="ghost"
              title="Status zurück auf Entwurf setzen"
              onClick={() => setSendStatus.mutate("draft")}
              disabled={setSendStatus.isPending}
            >
              Zurück auf Entwurf
            </Button>
          )}

          {!locked && (
            <Button
              variant={editMode ? "secondary" : "default"}
              onClick={() => setEditMode((v) => !v)}
            >
              <Pencil className="size-4" /> {editMode ? "Vorschau" : "Bearbeiten"}
            </Button>
          )}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center justify-end gap-2">
        {editMode && (
          <>
            <Button
              variant="outline"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
            >
              <Copy className="size-4" /> Duplizieren
            </Button>
            {isInvoice && (
              <>
                <Button variant="outline" onClick={() => void exportXRechnung()}>
                  <FileCode2 className="size-4" /> XRechnung (XML)
                </Button>
                <Button variant="outline" onClick={() => void exportZugferd()}>
                  <FileDown className="size-4" /> ZUGFeRD-PDF
                </Button>
              </>
            )}
          </>
        )}

        {isInvoice && !isStorno && doc.status !== "paid" && doc.status !== "cancelled" && (
          <Button
            variant="outline"
            onClick={() => {
              setPayDate(formatDate(String(form["paid_at"] ?? today())));
              setPayOpen(true);
            }}
            disabled={markPaid.isPending}
          >
            <BadgeEuro className="size-4" /> Als bezahlt markieren
          </Button>
        )}
        {isInvoice && doc.status === "paid" && (
          <>
            <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
              Bezahlt{form["paid_at"] ? ` am ${formatDate(String(form["paid_at"]))}` : ""}
            </span>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog({
                  title: "Zahlung zurücknehmen",
                  description: "Die Rechnung gilt danach wieder als offen.",
                  confirmLabel: "Zurücknehmen",
                  action: () => unmarkPaid.mutate(),
                })
              }
              disabled={unmarkPaid.isPending}
            >
              <BadgeEuro className="size-4" /> Zahlung zurücknehmen
            </Button>
          </>
        )}

        {isInvoice &&
          !isStorno &&
          doc.status !== "paid" &&
          doc.status !== "cancelled" &&
          doc.status !== "draft" && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setConfirmDialog({
                    title: "Zahlungserinnerung senden",
                    description: "Freundliche Zahlungserinnerung jetzt erfassen und versenden?",
                    confirmLabel: "Jetzt senden",
                    action: () => reminder.mutate("erinnerung"),
                  })
                }
                disabled={reminder.isPending}
              >
                <BellRing className="size-4" /> Zahlungserinnerung
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setConfirmDialog({
                    title: `${mahnLabel(Math.max(2, reminderLevel + 1))} senden`,
                    description:
                      "Dieser Schritt wird GoBD-konform protokolliert. Jetzt offiziell mahnen?",
                    confirmLabel: "Jetzt senden",
                    action: () => reminder.mutate("mahnung"),
                  })
                }

                disabled={reminder.isPending || !canMahnen}
                title={
                  canMahnen
                    ? undefined
                    : "Erst möglich, wenn die Zahlungsfrist (14 Tage) vollständig abgelaufen ist."
                }
              >
                <BellRing className="size-4" />
                {reminderLevel > 1 ? `${mahnLabel(reminderLevel)} · nächste Stufe` : "Mahnung"}
              </Button>
            </>
          )}

        {isQuote && (
          <>
            {doc.status !== "accepted" && doc.status !== "declined" && (
              <>
                <Button variant="outline" onClick={() => decide.mutate("accepted")}>
                  <Check className="size-4" /> Angebot annehmen
                </Button>
                <Button variant="outline" onClick={() => decide.mutate("declined")}>
                  <X className="size-4" /> Angebot ablehnen
                </Button>
              </>
            )}
            {!convertedId && doc.status === "accepted" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => convert.mutate()}
                  disabled={convert.isPending}
                >
                  <ArrowRightLeft className="size-4" /> Auftragsbestätigung erstellen
                </Button>
                <Button
                  onClick={() => quoteToInvoice.mutate()}
                  disabled={quoteToInvoice.isPending}
                  title="Einmalige Dienstleistung direkt abrechnen"
                >
                  <ArrowRightLeft className="size-4" /> In Rechnung umwandeln
                </Button>
              </>
            )}
          </>
        )}

        {isOrder && !convertedId && (
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            <ArrowRightLeft className="size-4" /> In Rechnung umwandeln
          </Button>
        )}

        {isOrder && !locked && (
          <Button
            variant="destructive"
            onClick={() =>
              setConfirmDialog({
                title: "Auftragsbestätigung löschen?",
                description: `„${doc.number ?? ""}" wird in den Papierkorb verschoben und kann dort 30 Tage lang wiederhergestellt werden.`,
                confirmLabel: "In Papierkorb verschieben",
                destructive: true,
                action: () => remove.mutate(),
              })
            }
            disabled={remove.isPending}
          >
            <Trash2 className="size-4" /> Löschen
          </Button>
        )}

        {!locked && editMode && (
          <>
            <span className="text-xs text-muted-foreground">
              {autoSavedAt
                ? `Automatisch gespeichert um ${autoSavedAt} Uhr`
                : "Änderungen werden automatisch gespeichert"}
            </span>
            <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" /> Speichern
            </Button>
          </>
        )}

        {locked && isInvoice && !isStorno && !cancelledBy && (
          <Button
            variant="destructive"
            onClick={() => setStornoOpen(true)}
            disabled={storno.isPending}
          >
            <Ban className="size-4" /> Stornorechnung
          </Button>
        )}
      </div>

      <Dialog open={stornoOpen} onOpenChange={(o) => !o && setStornoOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stornorechnung erstellen</DialogTitle>
            <DialogDescription>
              Es wird ein neuer Beleg mit eigener fortlaufender Nummer und negativen Beträgen
              erzeugt. Der Stornogrund wird revisionssicher gespeichert und auf dem Storno-Beleg
              gedruckt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="storno-reason">Stornogrund (Pflichtangabe)</Label>
            <Textarea
              id="storno-reason"
              value={stornoReason}
              onChange={(e) => setStornoReason(e.target.value)}
              placeholder="z. B. Falscher Leistungszeitraum, Kunde storniert, fehlerhafte Positionen …"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStornoOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => storno.mutate(stornoReason)}
              disabled={storno.isPending || stornoReason.trim().length < 3}
            >
              Storno erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {locked && lockedAt && (
        <div className="no-print flex flex-wrap items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Festgeschrieben – GoBD-konform unveränderbar</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  docRecord["archived_at"] || docRecord["pdf_sha256"]
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {docRecord["archived_at"] || docRecord["pdf_sha256"]
                  ? "GoBD-Archiviert"
                  : "PDF-Archivierung ausstehend"}
              </span>
            </div>
            <p className="text-muted-foreground">
              Festgeschrieben am {formatDate(lockedAt)}
              {docRecord["archived_at"]
                ? ` · GoBD-Archiviert am ${formatDate(String(docRecord["archived_at"]))}`
                : ""}
              {docRecord["pdf_sha256"]
                ? ` · Archiv-Prüfsumme (SHA-256): ${String(docRecord["pdf_sha256"]).slice(0, 16)}…`
                : ""}
              {cancelledBy
                ? ` · Diese Rechnung wurde storniert${stornoNumber ? ` durch ${stornoNumber}` : ""}.`
                : ""}
              {isStorno ? ` · Stornorechnung${stornoNumber ? ` zu ${stornoNumber}` : ""}` : ""}
              {stornoGrund ? ` · Stornogrund: ${stornoGrund}` : ""}
            </p>
            <p className="font-medium text-destructive">
              Löschen und Überschreiben sind für diesen Beleg gesperrt. Korrekturen ausschließlich
              per Stornorechnung.
            </p>
          </div>
        </div>
      )}

      {(followUpDoc || sourceDoc) && (
        <div className="no-print rounded-lg border border-border bg-muted/40 p-4 text-sm">
          {followUpDoc && (
            <p>
              {followUpDoc.type === "invoice"
                ? "Für diesen Beleg wurde bereits eine Rechnung erstellt: "
                : "Folgebeleg erstellt: "}
              <Link
                to="/dokumente/$id"
                params={{ id: followUpDoc.id }}
                className="font-medium underline"
              >
                {followUpDoc.number}
              </Link>
            </p>
          )}
          {sourceDoc && (
            <p>
              Erstellt aus{" "}
              {sourceDoc.type === "quote" ? "Angebot" : DOC_TYPE_LABEL[sourceDoc.type] ?? "Beleg"}{" "}
              <Link
                to="/dokumente/$id"
                params={{ id: sourceDoc.id }}
                className="font-medium underline"
              >
                {sourceDoc.number}
              </Link>
            </p>
          )}
        </div>
      )}


      {(due || reminderLevel > 0) && (
        <div
          className={`no-print rounded-lg border p-4 text-sm ${
            due?.overdue ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"
          }`}
        >
          <span className={due?.overdue ? "font-medium text-destructive" : "font-medium"}>
            {due?.label ?? "Offener Posten"}
          </span>
          {reminderLevel > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {mahnLabel(reminderLevel)}
              {docRecord["last_reminder_at"]
                ? ` vom ${formatDate(String(docRecord["last_reminder_at"]))}`
                : ""}
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={locked}
        hidden={!editMode}
        className="no-print surface space-y-6 p-6 disabled:opacity-90"
      >
        <h2 className="font-display text-xl font-semibold">
          {DOC_TYPE_LABEL[doc.type]} {docNumber} {locked ? "(schreibgeschützt)" : "bearbeiten"}
        </h2>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <Label>Steuer-Art</Label>
          {isSmallBusiness && (
            <p className="rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              Kleinunternehmerregelung (§ 19 UStG) ist im Firmenprofil aktiv – es wird keine
              Umsatzsteuer berechnet oder ausgewiesen.
            </p>
          )}
          <Select
            value={taxMode}
            onValueChange={(v) => setField("tax_mode", v)}
            disabled={isSmallBusiness}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="domestic">Inland (Deutschland) – 19 % MwSt.</SelectItem>
              <SelectItem value="eu_reverse_charge" disabled={!reverseChargeAllowed}>
                EU-Ausland – Reverse-Charge (0 % MwSt.)
                {reverseChargeAllowed ? "" : " – ab Pro"}
              </SelectItem>
              <SelectItem value="kleinunternehmer">
                Kleinunternehmer § 19 UStG (0 % MwSt.)
              </SelectItem>
            </SelectContent>
          </Select>
          {!reverseChargeAllowed && (
            <p className="flex flex-wrap items-center gap-1 rounded-md border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Rechnungen ohne MwSt. (Reverse-Charge für EU-Ausland) sind ab dem{" "}
              <strong className="font-semibold text-foreground">Pro-Paket</strong> verfügbar.
              <Link to="/mein-paket" className="font-medium text-primary underline">
                Paket ansehen
              </Link>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {taxMode === "domestic"
              ? "Es werden 19 % Umsatzsteuer ausgewiesen. Es wird kein Steuerhinweis gedruckt."
              : `0 % Umsatzsteuer. Folgender Pflichthinweis erscheint automatisch auf dem Dokument: „${taxNote}“`}
          </p>
        </div>


        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="number">
              {isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer"}{" "}
              (automatisch)
            </Label>
            <Input id="number" value={docNumber} readOnly disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">
              {isDraftPlaceholder(docNumber)
                ? "Vorschau-/Testnummer. Die endgültige, fortlaufende Nummer wird erst beim Festschreiben bzw. Versenden vergeben – so entstehen keine Lücken (§ 14 UStG / GoBD)."
                : "Wird automatisch fortlaufend und lückenlos vergeben (§ 14 UStG / GoBD) – eine manuelle Änderung ist nicht möglich."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order_number">Bestellnummer des Kunden</Label>
            <Input
              id="order_number"
              placeholder="z. B. SGS-PO-123456"
              value={String(form["order_number"] ?? "")}
              onChange={(e) => setField("order_number", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={String(form["status"] ?? "draft")}
              onValueChange={(v) => setField("status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(isInvoice
                  ? ["draft", "sent", "paid", "cancelled"]
                  : ["draft", "sent", "accepted", "declined"]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rechnungsdatum</Label>
            <Input
              type="date"
              value={String(form["issue_date"] ?? "")}
              onChange={(e) => setField("issue_date", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{isInvoice ? "Fällig am" : "Gültig bis (optional)"}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={String(form["due_date"] ?? "")}
                onChange={(e) => setField("due_date", e.target.value)}
              />
              {!isInvoice && form["due_date"] ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setField("due_date", "")}
                >
                  Löschen
                </Button>
              ) : null}
            </div>
            {!isInvoice && (
              <p className="text-xs text-muted-foreground">
                Ohne Datum wird „Gültig bis“ nicht auf dem Angebot angezeigt.
              </p>
            )}
          </div>
          {isInvoice && (
            <div className="space-y-2">
              <Label>Zahlungsdatum (bezahlt am)</Label>
              <Input
                type="date"
                value={String(form["paid_at"] ?? "")}
                onChange={(e) => setField("paid_at", e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">
                Sobald ein Zahlungsdatum eingetragen ist, wechselt der Status automatisch auf
                „Bezahlt" und die Rechnung verlässt die offenen Posten.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="service_period">Leistungszeitraum / Lieferdatum</Label>
            <DateRangeField
              value={String(form["service_period"] ?? "")}
              onChange={(v) => setField("service_period", v)}
              placeholder="Zeitraum im Kalender wählen"
            />
            {isInvoice ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={applyIssueMonth}>
                  Monat des Rechnungsdatums übernehmen
                </Button>
                {dateCheck.message ? (
                  <p
                    className={
                      dateCheck.level === "error"
                        ? "text-xs text-destructive"
                        : "text-xs text-amber-600 dark:text-amber-500"
                    }
                  >
                    {dateCheck.message}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Kunde auswählen</Label>
          <Select value={String(form["customer_id"] ?? "")} onValueChange={pickCustomer}>
            <SelectTrigger>
              <SelectValue placeholder="Kunde aus dem Kundenstamm wählen" />
            </SelectTrigger>
            <SelectContent>
              {data.customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.company || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              { key: "customer_company", label: "Firma" },
              { key: "customer_name", label: "Ansprechpartner" },
              { key: "customer_email", label: "E-Mail" },
              { key: "customer_vat_id", label: "USt-IdNr. des Kunden" },
              { key: "customer_address_line", label: "Straße und Hausnummer" },
              { key: "customer_postal_code", label: "PLZ" },
              { key: "customer_city", label: "Ort" },
              { key: "customer_country", label: "Land" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={String(form[key] ?? "")}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Positionen</Label>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    position: prev.length + 1,
                    description: "",
                    quantity: 1,
                    unit: "Std.",
                    unit_price: Number(prev[prev.length - 1]?.unit_price) || DEFAULT_NET_RATE,
                    is_optional: false,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Position
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Alle Preise werden als <strong>Netto-Beträge</strong> (z. B. Netto-Stundensatz)
            eingegeben. Die Umsatzsteuer wird automatisch berechnet.
          </p>

          {items.map((item, index) => (
            <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
              <div className="space-y-1 sm:col-span-5">
                <Label className="text-xs text-muted-foreground">Bezeichnung</Label>
                <Input
                  placeholder="Bezeichnung (z. B. Unterhaltsreinigung Büro)"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Menge</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Einheit</Label>
                <Select
                  value={UNIT_OPTIONS.includes(item.unit) ? item.unit : "__custom"}
                  onValueChange={(v) => updateItem(index, { unit: v === "__custom" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Einheit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom">Andere …</SelectItem>
                  </SelectContent>
                </Select>
                {!UNIT_OPTIONS.includes(item.unit) && (
                  <Input
                    placeholder="Eigene Einheit"
                    value={item.unit}
                    onChange={(e) => updateItem(index, { unit: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Netto-Preis / Einheit €</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end sm:col-span-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs sm:col-span-12">
                <Checkbox
                  checked={Boolean(item.is_optional)}
                  onCheckedChange={(v) => updateItem(index, { is_optional: v === true })}
                />
                <span>Optionale Zusatzleistung (nur bei Durchführung berechnet)</span>
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-12">
                Netto {formatMoney(item.quantity * item.unit_price)}
                {vatRate > 0 && (
                  <>
                    {" · "}Brutto inkl. {formatNumber(vatRate)} % MwSt.{" "}
                    {formatMoney(item.quantity * item.unit_price * (1 + vatRate / 100))}
                  </>
                )}
              </p>
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Rabatt (%)</Label>
              <Input
                inputMode="decimal"
                value={String(form["discount_percent"] ?? "0")}
                onChange={(e) => setField("discount_percent", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Rabattgrund</Label>
              <Input
                value={String(form["discount_reason"] ?? "")}
                onChange={(e) => setField("discount_reason", e.target.value)}
                placeholder="z. B. Treuerabatt"
              />
            </div>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zwischensumme (netto)</span>
              <span>{formatMoney(itemsTotal)}</span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Rabatt {formatNumber(discountPercent)} %
                  {discountReason ? ` (${discountReason})` : ""}
                </span>
                <span>−{formatMoney(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nettobetrag</span>
              <span>{formatMoney(netTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                zzgl. Umsatzsteuer {formatNumber(vatRate)} %
              </span>
              <span>{formatMoney(vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-display text-base font-semibold">
              <span>Bruttobetrag</span>
              <span>{formatMoney(grossTotal)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="intro">Einleitungstext</Label>
            <Textarea
              id="intro"
              value={String(form["intro_text"] ?? "")}
              onChange={(e) => setField("intro_text", e.target.value)}
              placeholder="Für die erbrachten Reinigungsleistungen berechnen wir Ihnen wie folgt:"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Schlussbemerkung</Label>
            <Textarea
              id="notes"
              value={String(form["notes"] ?? "")}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>
        </div>

        {!isInvoice && (
          <div className="space-y-2">
            <Label htmlFor="service_description">
              Detaillierte Leistungsbeschreibung (optional)
            </Label>
            <Textarea
              id="service_description"
              rows={8}
              value={String(form["service_description"] ?? "")}
              onChange={(e) => setField("service_description", e.target.value)}
              placeholder={
                "Beschreiben Sie hier ausführlich, welche Reinigungsleistungen enthalten sind, z. B.:\n" +
                "- Unterhaltsreinigung Büroflächen (Staubwischen, Böden, Papierkörbe)\n" +
                "- Sanitärreinigung inkl. Desinfektion und Auffüllen der Verbrauchsmaterialien\n" +
                "- Glasreinigung innen, monatlich\n" +
                "- Alle Reinigungsmittel und Geräte inklusive"
              }
            />
            <p className="text-xs text-muted-foreground">
              Erscheint übersichtlich im PDF-Angebot unter „Leistungsbeschreibung“. Jede Zeile wird
              als eigener Punkt dargestellt (Zeilen mit „-“ oder „•“ werden als Liste formatiert).
            </p>
          </div>
        )}
      </fieldset>

      {/* Druckansicht – DIN 5008 */}
      <article className="paper print-area relative mx-auto text-sm">
        {/* Runder Storno-Stempel als Wasserzeichen auf dem Beleg (wie im PDF). */}
        {(cancelledBy || isStorno) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div
              className="flex size-64 rotate-[-25deg] items-center justify-center rounded-full border-[6px] border-destructive/60"
              aria-hidden
            >
              <div className="flex size-[calc(100%-1rem)] items-center justify-center rounded-full border-2 border-destructive/60">
                <span className="font-black uppercase tracking-widest text-3xl text-destructive/60 select-none">
                  STORNO
                </span>
              </div>
            </div>
          </div>
        )}
        <div>
          <header className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt="Firmenlogo"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  className="invoice-logo w-auto max-w-56 object-contain"
                />
              ) : (
                <div className="invoice-logo flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted font-display text-lg font-bold text-muted-foreground">
                  {String(settings?.["company_name"] ?? "")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w.charAt(0).toUpperCase())
                    .join("")}
                </div>
              )}
              <div>
                <h1 className="font-display text-2xl font-bold">
                  {String(settings?.["company_name"] ?? "")}
                </h1>
                {settings?.["owner_name"] && (
                  <p className="text-xs text-muted-foreground">
                    Inhaber: {String(settings["owner_name"])}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {settings?.["email"] && <div>{String(settings["email"])}</div>}
              {settings?.["phone"] && <div>{String(settings["phone"])}</div>}
            </div>
          </header>

          <div className="mt-7 grid gap-8 sm:grid-cols-2">
            <address className="not-italic">
              <div className="border-b pb-1 text-[10px] text-muted-foreground">{senderLine}</div>
              <div className="mt-3 font-medium">{String(form["customer_company"] ?? "")}</div>
              <div>{String(form["customer_name"] ?? "")}</div>
              <div>{String(form["customer_address_line"] ?? "")}</div>
              <div>
                {String(form["customer_postal_code"] ?? "")} {String(form["customer_city"] ?? "")}
              </div>
              <div>{String(form["customer_country"] ?? "")}</div>
              {form["customer_vat_id"] && (
                <div className="mt-1 text-xs">USt-IdNr.: {String(form["customer_vat_id"])}</div>
              )}
            </address>
            <dl className="space-y-1 text-right">
              {form["customer_number"] && (
                <div>
                  <dt className="inline text-muted-foreground">Kundennummer: </dt>
                  <dd className="inline font-medium">{String(form["customer_number"])}</dd>
                </div>
              )}
              <div>
                <dt className="inline text-muted-foreground">
                  {isInvoice ? "Rechnungsnummer" : isOrder ? "Auftragsnummer" : "Angebotsnummer"}
                  :{" "}
                </dt>
                <dd className="inline font-medium">{docNumber}</dd>
              </div>

              <div>
                <dt className="inline text-muted-foreground">
                  {isInvoice ? "Rechnungsdatum" : "Datum"}:{" "}
                </dt>
                <dd className="inline">{formatDate(String(form["issue_date"] ?? ""))}</dd>
              </div>
              {form["service_period"] && (
                <div>
                  <dt className="inline text-muted-foreground">Leistungszeitraum: </dt>
                  <dd className="inline">{String(form["service_period"])}</dd>
                </div>
              )}
              {form["due_date"] && (
                <div>
                  <dt className="inline text-muted-foreground">
                    {isInvoice ? "Fällig am" : "Gültig bis"}:{" "}
                  </dt>
                  <dd className="inline">{formatDate(String(form["due_date"]))}</dd>
                </div>
              )}
              {form["order_number"] && (
                <div>
                  <dt className="inline text-muted-foreground">Bestellnummer: </dt>
                  <dd className="inline font-medium">{String(form["order_number"])}</dd>
                </div>
              )}
            </dl>
          </div>

          {isInvoice ? (
            <h2 className="mt-7 font-display text-xl font-semibold">
              {DOC_TYPE_LABEL[doc.type]} {docNumber}
            </h2>
          ) : (
            <>
              <h2 className="mt-7 text-center font-display text-lg font-bold text-balance">
                {String(form["title"] ?? "").trim()
                  ? String(form["title"]).trim()
                  : (isOrder ? orderHeadline : quoteHeadline)(
                      deriveServiceName(
                        form["service_description"] ? String(form["service_description"]) : "",
                        items[0]?.description ?? "",
                      ),
                    )}
              </h2>
              <p className="mt-3 text-justify text-sm leading-relaxed">
                {quoteIntro(String(settings?.["company_name"] ?? ""))}
              </p>
            </>
          )}
          {/* Einleitungstext live aus dem Eingabefeld – direkt über der Positionstabelle. */}
          {isInvoice && !introText && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{INVOICE_INTRO}</p>
          )}
          {introText && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{introText}</p>
          )}

          <div className="invoice-table-wrap mt-4 overflow-x-auto">
            <table className="invoice-table w-full border-collapse text-left text-sm">
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "38%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead>
                <tr className="bg-muted text-[11px] tracking-normal text-muted-foreground uppercase">
                  <th className="px-2 py-2 font-medium">Pos.</th>
                  <th className="px-2 py-2 font-medium">Bezeichnung</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Menge</th>
                  <th className="px-2 py-2 font-medium">Einheit</th>
                  <th className="px-2 py-2 text-right font-medium">Einzelpreis netto €</th>
                  <th className="px-2 py-2 text-right font-medium">Gesamtpreis netto €</th>
                </tr>
              </thead>
              <tbody>
                {(hasOptionalItems
                  ? [...items.filter((i) => !i.is_optional), ...items.filter((i) => i.is_optional)]
                  : items
                ).map((i, n, arr) => (
                  <Fragment key={i.id}>
                    {hasOptionalItems && n === 0 && (
                      <tr className="bg-muted/70">
                        <td colSpan={6} className="px-2 py-2 text-sm font-semibold">
                          Regelmäßige Leistungen
                        </td>
                      </tr>
                    )}
                    {hasOptionalItems && i.is_optional && !arr[n - 1]?.is_optional && (
                      <>
                        <tr className="border-b border-border">
                          <td colSpan={5} className="px-2 py-2 text-sm font-semibold">
                            Monatlicher Festpreis (netto)
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                            {formatMoney(regularTotal)}
                          </td>
                        </tr>
                        <tr className="bg-muted/70">
                          <td colSpan={6} className="px-2 py-2 text-sm font-semibold">
                            Optionale Zusatzleistungen
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className="border-b border-border align-top">
                      <td className="px-2 py-2 tabular-nums">{n + 1}</td>
                      <td className="px-2 py-2 break-words whitespace-pre-line">{i.description}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatNumber(i.quantity)}
                      </td>
                      <td className="px-2 py-2">{i.unit}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {formatMoney(i.unit_price)}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                        {formatMoney(i.quantity * i.unit_price)}
                      </td>
                    </tr>
                    {hasOptionalItems && !i.is_optional && n === arr.length - 1 && (
                      <tr className="border-b border-border">
                        <td colSpan={5} className="px-2 py-2 text-sm font-semibold">
                          Monatlicher Festpreis (netto)
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                          {formatMoney(regularTotal)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {hasOptionalItems && (
              <p className="mt-2 text-xs text-muted-foreground">{OPTIONAL_NOTE}</p>
            )}
          </div>

          {!isInvoice && form["service_description"] && (
            <section className="invoice-description mt-6">
              <h3 className="font-display text-base font-semibold">Leistungsbeschreibung</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {String(form["service_description"])
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => {
                    const bullet = /^[-•*]\s*/.test(line);
                    const text = line.replace(/^[-•*]\s*/, "");
                    return bullet ? (
                      <li key={index} className="flex gap-2">
                        <span aria-hidden="true">•</span>
                        <span className="break-words">{text}</span>
                      </li>
                    ) : (
                      <li key={index} className="list-none font-medium break-words">
                        {text}
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </div>

        <div className="invoice-summary-block">
          <div className="invoice-closing">
            <div className="mt-3 flex justify-end">
              <div className="w-72 space-y-0.5">
                {discountPercent > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Zwischensumme (netto)</span>
                      <span>{formatMoney(itemsTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Rabatt {formatNumber(discountPercent)} %
                        {discountReason ? ` – ${discountReason}` : ""}
                      </span>
                      <span>−{formatMoney(discountAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nettobetrag (Summe netto)</span>
                  <span>{formatMoney(netTotal)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    zzgl. Umsatzsteuer {formatNumber(vatRate)} %
                  </span>
                  <span>{formatMoney(vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-display text-base font-semibold">
                  <span>{vatRate > 0 ? "Bruttobetrag (inkl. MwSt.)" : "Gesamtbetrag"}</span>
                  <span>{formatMoney(grossTotal)}</span>
                </div>
              </div>
            </div>

            {taxNote && <p className="mt-4 rounded-md bg-muted p-2.5 text-xs">{taxNote}</p>}

            {form["notes"] && <p className="mt-3 text-sm">{String(form["notes"])}</p>}

            {isInvoice ? (
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-0.5 text-sm">
                  <p>Zahlüberweisung in {paymentTermsDays} Tagen</p>
                  <p>Vielen Dank für die gute Zusammenarbeit.</p>
                </div>

                <GiroCode payload={epc} size={84} />
              </div>
            ) : (
              <div className="mt-4 space-y-2 text-sm">
                <p>Zahlüberweisung in {paymentTermsDays} Tagen</p>
                {!isOrder && <p className="text-justify leading-relaxed">{QUOTE_DISCLAIMER}</p>}
                {isOrder && (
                  <p className="text-justify text-xs leading-relaxed text-muted-foreground">
                    {CANCELLATION_TERMS}
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="mt-8 grid gap-4 border-t pt-3 text-[11px] text-muted-foreground sm:grid-cols-3">
            <div>
              <div className="font-medium text-foreground">
                {String(settings?.["company_name"] ?? "")}
              </div>
              <div>{String(settings?.["address_line"] ?? "")}</div>
              <div>
                {String(settings?.["postal_code"] ?? "")} {String(settings?.["city"] ?? "")}
              </div>
              {settings?.["phone"] && <div>Tel. {String(settings["phone"])}</div>}
              {settings?.["email"] && <div>{String(settings["email"])}</div>}
            </div>
            <div>
              <div className="font-medium text-foreground">Steuerangaben</div>
              <div>USt-IdNr.: {String(settings?.["vat_id"] ?? "")}</div>
              <div>Steuernummer: {String(settings?.["tax_number"] ?? "")}</div>
              {settings?.["owner_name"] && <div>Inhaber: {String(settings["owner_name"])}</div>}
            </div>
            <div>
              <div className="font-medium text-foreground">Bankverbindung</div>
              <div>{String(settings?.["bank_name"] ?? "")}</div>
              <div>IBAN {String(settings?.["iban"] ?? "")}</div>
              <div>BIC {String(settings?.["bic"] ?? "")}</div>
            </div>
          </footer>
        </div>
      </article>

      <SendEmailDialog
        open={mailOpen}
        onOpenChange={setMailOpen}
        defaults={{
          to: mail.to,
          subject: mail.subject,
          body: mail.body,
          signatureText: mail.signatureText,
          signatureHtml: mail.signatureHtml,
          fileBaseName: `${DOC_TYPE_LABEL[doc.type]}-${docNumber}`,
          companyName: String(settings?.["company_name"] ?? ""),
          companyEmail: String(settings?.["email"] ?? ""),
        }}
        buildPdfBytes={makePdfBytes}
        onSent={async () => {
          // Versand-Status verbindlich in der Datenbank setzen (auch für Angebote),
          // damit der Beleg in der Übersicht als "Versendet" erscheint.
          const { data: updated, error: sendError } = await supabase
            .from("documents")
            .update({ status: "sent", sent_at: new Date().toISOString() } as never)
            .eq("id", id)
            .select("id, status")
            .maybeSingle();
          if (sendError || !updated) {
            toast.error(
              `Status konnte nicht auf "Versendet" gesetzt werden: ${
                sendError?.message ?? "Beleg nicht gefunden"
              }`,
            );
          } else {
            setField("status", "sent");
          }
          try {
            await logAudit("sent", { id, number: docNumber }, { to: mail.to });
          } catch {
            /* Protokollierung darf den Versand nicht blockieren */
          }
          // Entwurfsnummer (DEMO) beim Versand durch die offizielle Nummer ersetzen.
          if (!locked) {
            try {
              await ensureOfficialNumber(id);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Nummernvergabe fehlgeschlagen");
            }
          }
          // Rechnungen werden beim Versand automatisch festgeschrieben (GoBD).
          if (isInvoice && !locked) {
            try {
              await finalize.mutateAsync();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Festschreiben fehlgeschlagen");
            }
          }
          await queryClient.invalidateQueries({ queryKey: ["document", id] });
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
          await queryClient.refetchQueries({ queryKey: ["documents"] });
        }}
      />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Als bezahlt markieren</DialogTitle>
            <DialogDescription>Zahlungsdatum im Format TT.MM.JJJJ erfassen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="detail-pay-date">Zahlungsdatum</Label>
            <Input
              id="detail-pay-date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              placeholder="TT.MM.JJJJ"
              inputMode="numeric"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                const iso = parseGermanDate(payDate);
                if (!iso) {
                  toast.error("Bitte das Datum im Format TT.MM.JJJJ eingeben.");
                  return;
                }
                markPaid.mutate(iso);
                setPayOpen(false);
              }}
              disabled={markPaid.isPending}
            >
              Zahlung buchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog !== null} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Abbrechen
            </Button>
            <Button
              variant={confirmDialog?.destructive ? "destructive" : "default"}
              onClick={() => {
                confirmDialog?.action();
                setConfirmDialog(null);
              }}
            >
              {confirmDialog?.confirmLabel ?? "Bestätigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
