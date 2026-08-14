import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  formatNumber,
  taxNoteForTaxMode,
  today,
  vatRateForTaxMode,

} from "@/lib/format";
import { buildEpcPayload } from "@/lib/epc";
import { GiroCode } from "@/components/GiroCode";
import { DateRangeField } from "@/components/DateRangeField";
import { SendEmailDialog } from "@/components/SendEmailDialog";
import { buildSignatureHtml } from "@/lib/signature";
import { useFileUrl } from "@/hooks/useFileUrl";
import { archiveDocumentPdf, createStorno, finalizeDocument, logAudit } from "@/lib/gobd";
import { describeGobdError, editBlockedMessage, isLockedDocument } from "@/lib/gobd-guard";
import {
  convertQuoteToInvoice,
  dueInfo,
  mahnLabel,
  mahnungAllowed,
  markInvoicePaid,
  unmarkInvoicePaid,
  sendReminder,
  setQuoteDecision,
  type ReminderKind,
} from "@/lib/workflow";

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
};

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
      return {
        doc: doc.data,
        items: (items.data ?? []) as Item[],
        settings: settings.data,
        customers: customers.data ?? [],
      };
    },
  });

  const [form, setForm] = useState<Record<string, string | boolean | null>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [mailOpen, setMailOpen] = useState(false);

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
      })),
    );
  }, [data]);

  const taxMode = String(form["tax_mode"] ?? "eu_reverse_charge");
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
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(String(form["discount_percent"] ?? "0").replace(",", ".")) || 0),
  );
  const discountAmount = (itemsTotal * discountPercent) / 100;
  const discountReason = String(form["discount_reason"] ?? "");
  const netTotal = itemsTotal - discountAmount;
  const vatAmount = (netTotal * vatRate) / 100;
  const grossTotal = netTotal + vatAmount;


  const save = useMutation({
    mutationFn: async () => {
      const current = data?.doc as unknown as Record<string, unknown> | undefined;
      // Schutz: echte Belege (versendet/festgeschrieben) dürfen nie überschrieben werden.
      if (isLockedDocument(current)) throw new Error(editBlockedMessage(current));
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      // Nummern werden automatisch/fortlaufend vergeben und nie aus dem Formular übernommen.
      const number = String((data?.doc as { number?: string } | undefined)?.number ?? "").trim();
      if (!number) throw new Error("Beleg konnte nicht geladen werden.");

      const payload = {
        ...form,
        number,
        due_date: form["due_date"] ? form["due_date"] : null,
        paid_at: form["status"] === "paid" ? form["paid_at"] || today() : null,
        customer_id: form["customer_id"] || null,
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
          })),
        );
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      toast.success("Gespeichert");
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) =>
      toast.error(describeGobdError(e, data?.doc as unknown as Record<string, unknown>), {
        duration: 9000,
      }),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const doc = data!.doc as Record<string, unknown>;
      const { data: existing } = await supabase.from("documents").select("number, type");
      const prefix = String(doc["number"] ?? "").replace(/\d+$/, "");
      const max = (existing ?? [])
        .filter((d) => d.number.startsWith(prefix))
        .map((d) => parseInt(d.number.slice(prefix.length), 10))
        .filter((n) => Number.isFinite(n))
        .reduce((a, b) => Math.max(a, b), 0);
      const nextNr = `${prefix}${String(max + 1).padStart(4, "0")}`;

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
        ...rest
      } = doc as unknown as Record<string, unknown>;

      const { data: created, error } = await supabase
        .from("documents")
        .insert({ ...rest, user_id: userId, number: nextNr, status: "draft" } as never)
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
    mutationFn: () => createStorno(id),
    onSuccess: (newId) => {
      toast.success("Stornorechnung erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/dokumente/$id", params: { id: newId }, search: { bearbeiten: true } });
    },
    onError: (e: Error) => toast.error(e.message),
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

  const reminder = useMutation({
    mutationFn: (kind: ReminderKind) => sendReminder(id, kind),
    onSuccess: (level) => {
      toast.success(`${mahnLabel(level)} erfasst`);
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
    mutationFn: () => convertQuoteToInvoice(id),
    onSuccess: (newId) => {
      toast.success("Rechnung aus Angebot erstellt");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
  const settings = data.settings as Record<string, string | number | null> | null;
  const isInvoice = doc.type === "invoice";
  const reminderLevel = Number(docRecord["reminder_level"] ?? 0);
  const canMahnen = mahnungAllowed(docRecord["due_date"] as string | null);

  const convertedId = (docRecord["converted_document_id"] as string | null) ?? null;
  const due = dueInfo(doc.due_date, doc.status);
  const docNumber = doc.number;
  const senderLine = [
    settings?.["company_name"] ?? "Hom Reinigung Service",
    settings?.["address_line"] ?? "Poststraße 8",
    `${settings?.["postal_code"] ?? "66333"} ${settings?.["city"] ?? "Völklingen"}`.trim(),
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
      return next;
    });
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
          : euReverseCharge
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
    const subject = `${label} ${docNumber} – ${settings?.["company_name"] ?? "Hom Reinigung Service"}`;
    const baseLines = [
      `Sehr geehrte Damen und Herren,`,
      ``,
      isInvoice
        ? `im Anhang finden Sie unsere Rechnung ${docNumber} vom ${formatDate(String(form["issue_date"] ?? doc.issue_date))} als PDF-Dokument.`
        : `im Anhang finden Sie unser Angebot ${docNumber} vom ${formatDate(String(form["issue_date"] ?? doc.issue_date))} als PDF-Dokument.`,
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
        [settings?.["company_name"] ?? "Hom Reinigung Service", settings?.["phone"] ?? ""]
          .filter(Boolean)
          .join("\n"),
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

  const bankName = String(settings?.["bank_name"] ?? "") || "Sparkasse Saarbrücken";
  const iban = String(settings?.["iban"] ?? "") || "DE05 5905 0101 0067 2210 28";
  const bic = String(settings?.["bic"] ?? "") || "SAKSDE55XXX";

  const epc = isInvoice
    ? buildEpcPayload({
        name: String(settings?.["company_name"] ?? "Hom Reinigung Service"),
        iban,
        bic,
        amount: grossTotal,
        reference: `${DOC_TYPE_LABEL[doc.type]} ${docNumber}`,
      })
    : null;

  // ---- E-Rechnung (XRechnung / ZUGFeRD) ----------------------------------
  function eRechnungInput(): ERechnungInput {
    return {
      doc: { ...docRecord, ...form, number: docNumber },
      items,
      settings: settings as Record<string, unknown> | null,
      netTotal,
      vatAmount,
      grossTotal,
      vatRate,
      number: docNumber,
    };
  }

  function warnIfIncomplete(input: ERechnungInput) {
    const problems = validateERechnung(input);
    if (problems.length > 0) {
      toast.warning("Pflichtangaben unvollständig", { description: problems.join(" ") });
    }
  }

  async function exportXRechnung() {
    try {
      const input = eRechnungInput();
      warnIfIncomplete(input);
      downloadXml(buildXRechnungXml(input), `XRechnung_${docNumber.replace(/\W+/g, "_")}.xml`);
      await logAudit(
        "xrechnung_export",
        { id, number: docNumber },
        { format: "XRechnung 3.0 (UBL)" },
      );
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
    const companyName = String(settings?.["company_name"] ?? "Hom Reinigung Service");

    const meta: Array<{ label: string; value: string }> = [];
    if (form["customer_number"])
      meta.push({ label: "Kundennummer", value: String(form["customer_number"]) });
    meta.push({ label: isInvoice ? "Rechnungsnummer" : "Angebotsnummer", value: number });
    meta.push({
      label: isInvoice ? "Rechnungsdatum" : "Datum",
      value: formatDate(String(form["issue_date"] ?? "")),
    });
    if (form["service_period"])
      meta.push({ label: "Leistungszeitraum", value: String(form["service_period"]) });
    if (isInvoice && form["due_date"])
      meta.push({ label: "Fällig am", value: formatDate(String(form["due_date"])) });
    if (form["order_number"])
      meta.push({ label: "Bestellnummer", value: String(form["order_number"]) });

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
      title: `${DOC_TYPE_LABEL[doc.type]} ${number}`,
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
      introText: form["intro_text"] ? String(form["intro_text"]) : undefined,
      items: items.map((i) => ({
        description: i.description,
        quantity: formatNumber(i.quantity),
        unit: i.unit,
        unitPrice: formatMoney(i.unit_price),
        total: formatMoney(i.quantity * i.unit_price),
      })),
      serviceDescription:
        !isInvoice && form["service_description"]
          ? String(form["service_description"])
          : undefined,
      summary,
      taxNote: taxNote || undefined,
      notes: form["notes"] ? String(form["notes"]) : undefined,
      paymentLines: isInvoice
        ? [
            `Zahlüberweisung in ${paymentTermsDays} Tagen`,
            "Vielen Dank für die gute Zusammenarbeit.",
            `${bankName} · IBAN ${iban} · BIC ${bic}`,
          ]
        : undefined,
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
            `USt-IdNr.: ${String(settings?.["vat_id"] ?? "DE458492078")}`,
            `Steuernummer: ${String(settings?.["tax_number"] ?? "040/200/01653")}`,
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

  async function exportZugferd() {
    const toastId = toast.loading("ZUGFeRD-PDF wird erzeugt…");
    try {
      const input = eRechnungInput();
      warnIfIncomplete(input);
      const pdfBytes = await buildDocumentPdfBytes(await buildPdfData());
      const hybrid = await embedZugferdXml(pdfBytes, buildZugferdXml(input), {
        number: docNumber,
        title: DOC_TYPE_LABEL[doc.type] ?? "Rechnung",
      });
      downloadBytes(hybrid, `ZUGFeRD_${docNumber.replace(/\W+/g, "_")}.pdf`);
      await logAudit(
        "zugferd_export",
        { id, number: docNumber },
        { format: "ZUGFeRD 2.3 / Factur-X (EN 16931)" },
      );
      toast.success("ZUGFeRD-PDF (hybride E-Rechnung) erstellt", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message, { id: toastId });
    }
  }

  /** Fertiges Dokument direkt als A4-PDF herunterladen (pdf-lib, kein Browser-Druck). */
  async function downloadPdf() {
    const toastId = toast.loading("PDF wird erzeugt…");
    try {
      const bytes = await buildDocumentPdfBytes(await buildPdfData());
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
          <Button variant="outline" onClick={() => setMailOpen(true)}>
            <Mail className="size-4" /> Per E-Mail senden
          </Button>
          {!locked && (
            <Button variant={editMode ? "secondary" : "default"} onClick={() => setEditMode((v) => !v)}>
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
                const date = window.prompt(
                  "Zahlungsdatum (JJJJ-MM-TT) bestätigen:",
                  String(form["paid_at"] ?? today()),
                );
                if (!date) return;
                markPaid.mutate(date);
              }}
              disabled={markPaid.isPending}
            >
              <BadgeEuro className="size-4" /> Als bezahlt markieren
            </Button>
          )}
          {isInvoice && doc.status === "paid" && (
            <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
              Bezahlt{form["paid_at"] ? ` am ${formatDate(String(form["paid_at"]))}` : ""}
            </span>
          )}


          {isInvoice &&
            !isStorno &&
            doc.status !== "paid" &&
            doc.status !== "cancelled" &&
            doc.status !== "draft" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      confirm(
                        "Freundliche Zahlungserinnerung jetzt erfassen und versenden?\n\n[Jetzt senden] bestätigen.",
                      )
                    ) {
                      reminder.mutate("erinnerung");
                    }
                  }}
                  disabled={reminder.isPending}
                >
                  <BellRing className="size-4" /> Zahlungserinnerung
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      confirm(
                        `Offizielle ${mahnLabel(Math.max(2, reminderLevel + 1))} jetzt senden? Dieser Schritt wird GoBD-konform protokolliert.\n\n[Jetzt senden] bestätigen.`,
                      )
                    ) {
                      reminder.mutate("mahnung");
                    }
                  }}
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

          {!isInvoice && (
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
              {!convertedId && (
                <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
                  <ArrowRightLeft className="size-4" /> In Auftrag umwandeln
                </Button>
              )}
            </>
          )}

          {!locked && editMode && (
            <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" /> Speichern
            </Button>
          )}

          {locked && isInvoice && !isStorno && !cancelledBy && (
            <Button
              variant="destructive"
              onClick={() => {
                if (
                  confirm(
                    "Stornorechnung erstellen? Es wird ein neuer Beleg mit eigener fortlaufender Nummer und negativen Beträgen erzeugt.",
                  )
                ) {
                  storno.mutate();
                }
              }}
              disabled={storno.isPending}
            >
              <Ban className="size-4" /> Stornorechnung
            </Button>
          )}
      </div>


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
              {cancelledBy ? " · Diese Rechnung wurde storniert." : ""}
              {isStorno ? " · Stornorechnung" : ""}
            </p>
            <p className="font-medium text-destructive">
              Löschen und Überschreiben sind für diesen Beleg gesperrt. Korrekturen ausschließlich
              per Stornorechnung.
            </p>
          </div>
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
          <Select value={taxMode} onValueChange={(v) => setField("tax_mode", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="domestic">Inland (Deutschland) – 19 % MwSt.</SelectItem>
              <SelectItem value="eu_reverse_charge">
                EU-Ausland – Reverse-Charge (0 % MwSt.)
              </SelectItem>
              <SelectItem value="kleinunternehmer">
                Kleinunternehmer § 19 UStG (0 % MwSt.)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {taxMode === "domestic"
              ? "Es werden 19 % Umsatzsteuer ausgewiesen. Es wird kein Steuerhinweis gedruckt."
              : `0 % Umsatzsteuer. Folgender Pflichthinweis erscheint automatisch auf dem Dokument: „${taxNote}“`}
          </p>

        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="number">
              {isInvoice ? "Rechnungsnummer" : "Angebotsnummer"} (automatisch)
            </Label>
            <Input id="number" value={docNumber} readOnly disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">
              Wird automatisch fortlaufend und lückenlos vergeben (§ 14 UStG / GoBD) – eine manuelle
              Änderung ist nicht möglich.
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
          {isInvoice && (
            <div className="space-y-2">
              <Label>Fällig am</Label>
              <Input
                type="date"
                value={String(form["due_date"] ?? "")}
                onChange={(e) => setField("due_date", e.target.value)}
              />
            </div>
          )}
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
                  onValueChange={(v) =>
                    updateItem(index, { unit: v === "__custom" ? "" : v })
                  }
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
            <Label htmlFor="service_description">Detaillierte Leistungsbeschreibung (optional)</Label>
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
      <article className="paper print-area mx-auto text-sm">
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
                  {String(settings?.["company_name"] ?? "Hom Reinigung Service")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w.charAt(0).toUpperCase())
                    .join("")}
                </div>
              )}
              <div>
                <h1 className="font-display text-2xl font-bold">
                  {String(settings?.["company_name"] ?? "Hom Reinigung Service")}
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
                  {isInvoice ? "Rechnungsnummer" : "Angebotsnummer"}:{" "}
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
              {isInvoice && form["due_date"] && (
                <div>
                  <dt className="inline text-muted-foreground">Fällig am: </dt>
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

          <h2 className="mt-7 font-display text-xl font-semibold">
            {DOC_TYPE_LABEL[doc.type]} {docNumber}
          </h2>
          {form["intro_text"] && <p className="mt-2">{String(form["intro_text"])}</p>}

          <div className="invoice-table-wrap mt-4 overflow-x-auto">
            <table className="invoice-table w-full border-collapse text-left text-sm">
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "43%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="bg-muted text-[11px] tracking-normal text-muted-foreground uppercase">
                  <th className="px-2 py-2 font-medium">Pos.</th>
                  <th className="px-2 py-2 font-medium">Bezeichnung</th>
                  <th className="px-2 py-2 text-right font-medium">Menge</th>
                  <th className="px-2 py-2 font-medium">Einheit</th>
                  <th className="px-2 py-2 text-right font-medium">Einzelpreis netto €</th>
                  <th className="px-2 py-2 text-right font-medium">Gesamtpreis netto €</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i, n) => (
                  <tr key={i.id} className="border-b border-border align-top">
                    <td className="px-2 py-2 tabular-nums">{n + 1}</td>
                    <td className="px-2 py-2 break-words whitespace-pre-line">{i.description}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
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
                ))}
              </tbody>
            </table>
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

            {taxNote && (
              <p className="mt-4 rounded-md bg-muted p-2.5 text-xs">{taxNote}</p>
            )}

            {form["notes"] && <p className="mt-3 text-sm">{String(form["notes"])}</p>}

            {isInvoice && (
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-0.5 text-sm">
                  <p>Zahlüberweisung in {paymentTermsDays} Tagen</p>
                  <p>Vielen Dank für die gute Zusammenarbeit.</p>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {bankName} · IBAN {iban} · BIC {bic}
                  </p>
                </div>

                <GiroCode payload={epc} size={84} />
              </div>
            )}
          </div>

          <footer className="mt-8 grid gap-4 border-t pt-3 text-[11px] text-muted-foreground sm:grid-cols-3">
            <div>
              <div className="font-medium text-foreground">
                {String(settings?.["company_name"] ?? "Hom Reinigung Service")}
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
              <div>USt-IdNr.: {String(settings?.["vat_id"] ?? "DE458492078")}</div>
              <div>Steuernummer: {String(settings?.["tax_number"] ?? "040/200/01653")}</div>
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
        }}
        onSent={async () => {
          setField("status", "sent");
          await supabase
            .from("documents")
            .update({ status: "sent", sent_at: new Date().toISOString() } as never)
            .eq("id", id);
          await logAudit("sent", { id, number: docNumber }, { to: mail.to });
          // Rechnungen werden beim Versand automatisch festgeschrieben (GoBD).
          if (isInvoice && !locked) {
            try {
              await finalize.mutateAsync();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Festschreiben fehlgeschlagen");
            }
          }
          queryClient.invalidateQueries({ queryKey: ["document", id] });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }}
      />
    </div>
  );
}
