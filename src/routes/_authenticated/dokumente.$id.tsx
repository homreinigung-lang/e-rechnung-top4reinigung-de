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
  REVERSE_CHARGE_NOTE,
  STATUS_LABEL,
  formatDate,
  formatMoney,
  formatNumber,
} from "@/lib/format";
import { buildEpcPayload } from "@/lib/epc";
import { GiroCode } from "@/components/GiroCode";
import { DateRangeField } from "@/components/DateRangeField";
import { SendEmailDialog } from "@/components/SendEmailDialog";
import { useFileUrl } from "@/hooks/useFileUrl";
import { ArrowLeft, Copy, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dokumente/$id")({
  head: () => ({
    meta: [
      { title: "Dokument bearbeiten – Rechnungen & Angebote" },
      {
        name: "description",
        content:
          "Positionen erfassen, Steuerart wählen, Bestellnummer hinterlegen, drucken und per E-Mail senden.",
      },
      { property: "og:title", content: "Dokument bearbeiten" },
      { property: "og:description", content: "Rechnung oder Angebot bearbeiten und versenden." },
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

function DokumentDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
      customer_name: String(d["customer_name"] ?? ""),
      customer_company: String(d["customer_company"] ?? ""),
      customer_email: String(d["customer_email"] ?? ""),
      customer_address_line: String(d["customer_address_line"] ?? ""),
      customer_postal_code: String(d["customer_postal_code"] ?? ""),
      customer_city: String(d["customer_city"] ?? ""),
      customer_country: String(d["customer_country"] ?? ""),
      customer_vat_id: String(d["customer_vat_id"] ?? ""),
      intro_text: String(d["intro_text"] ?? ""),
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
  const vatRate = taxMode === "domestic" ? 19 : 0;

  const logoSrc = useFileUrl(
    data?.settings && (data.settings as Record<string, unknown>)["logo_url"]
      ? String((data.settings as Record<string, unknown>)["logo_url"])
      : "",
  );

  const netTotal = useMemo(

    () => items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );
  const vatAmount = (netTotal * vatRate) / 100;
  const grossTotal = netTotal + vatAmount;

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const number = String(form["number"] ?? "").trim();
      if (!number) throw new Error("Bitte eine Rechnungs-/Angebotsnummer eingeben.");

      const payload = {
        ...form,
        number,
        due_date: form["due_date"] ? form["due_date"] : null,
        customer_id: form["customer_id"] || null,
        vat_rate: vatRate,
        reverse_charge: taxMode !== "domestic",
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
    onError: (e: Error) => toast.error(e.message),
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
      navigate({ to: "/dokumente/$id", params: { id: newId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <p className="text-muted-foreground">Wird geladen…</p>;
  }

  const doc = data.doc;
  const settings = data.settings as Record<string, string | number | null> | null;
  const isInvoice = doc.type === "invoice";
  const docNumber = String(form["number"] ?? doc.number);
  const senderLine = [
    settings?.["company_name"] ?? "Hom Reinigung Service",
    settings?.["address_line"] ?? "Poststr 8",
    `${settings?.["postal_code"] ?? "66333"} ${settings?.["city"] ?? "Völklingen"}`.trim(),
  ]
    .filter(Boolean)
    .join(", ");

  function setField(key: string, value: string | boolean | null) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickCustomer(customerId: string) {
    const c = data!.customers.find((x) => x.id === customerId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      customer_id: c.id,
      customer_name: c.name,
      customer_company: c.company,
      customer_email: c.email,
      customer_address_line: c.address_line,
      customer_postal_code: c.postal_code,
      customer_city: c.city,
      customer_country: c.country,
      customer_vat_id: c.vat_id,
    }));
  }

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function buildMail() {
    const to = String(form["customer_email"] ?? "");
    const label = DOC_TYPE_LABEL[doc.type];
    const subject = `${label} ${docNumber} – ${settings?.["company_name"] ?? "Hom Reinigung Service"}`;
    const lines = [
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
      String(settings?.["email_signature"] ?? "") ||
        [settings?.["company_name"] ?? "Hom Reinigung Service", settings?.["phone"] ?? ""]
          .filter(Boolean)
          .join("\n"),
      settings?.["website_url"] ? String(settings["website_url"]) : "",
      settings?.["facebook_url"] ? String(settings["facebook_url"]) : "",
    ].filter(Boolean);

    return { to, subject, body: lines.join("\n") };
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

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dokumente">
            <ArrowLeft className="size-4" /> Zurück
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
            <Copy className="size-4" /> Duplizieren
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Drucken / PDF
          </Button>
          <Button variant="outline" onClick={() => setMailOpen(true)}>
            <Mail className="size-4" /> Per E-Mail senden
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" /> Speichern
          </Button>
        </div>
      </div>

      <div className="no-print surface space-y-6 p-6">
        <h2 className="font-display text-xl font-semibold">
          {DOC_TYPE_LABEL[doc.type]} {docNumber} bearbeiten
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
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {taxMode === "domestic"
              ? "Es werden 19 % Umsatzsteuer ausgewiesen. Der Reverse-Charge-Hinweis wird nicht gedruckt."
              : "0 % Umsatzsteuer. Der Hinweis zur Steuerschuldnerschaft erscheint automatisch auf dem Dokument."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="number">
              {isInvoice ? "Rechnungsnummer" : "Angebotsnummer"} (frei änderbar)
            </Label>
            <Input
              id="number"
              value={String(form["number"] ?? "")}
              onChange={(e) => setField("number", e.target.value)}
            />
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
                    unit_price: 0,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Position
            </Button>
          </div>

          {items.map((item, index) => (
            <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
              <Input
                className="sm:col-span-5"
                placeholder="Bezeichnung (z. B. Unterhaltsreinigung Büro)"
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
              />
              <Input
                className="sm:col-span-2"
                type="number"
                step="0.01"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
              />
              <Input
                className="sm:col-span-2"
                placeholder="Einheit"
                value={item.unit}
                onChange={(e) => updateItem(index, { unit: e.target.value })}
              />
              <Input
                className="sm:col-span-2"
                type="number"
                step="0.01"
                value={item.unit_price}
                onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="sm:col-span-1"
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zwischensumme netto</span>
              <span>{formatMoney(netTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Umsatzsteuer {formatNumber(vatRate)} %
              </span>
              <span>{formatMoney(vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-display text-base font-semibold">
              <span>Gesamtbetrag</span>
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

      </div>

      {/* Druckansicht – DIN 5008 */}
      <article className="paper print-area mx-auto w-full max-w-3xl p-9 text-sm">
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
                <th className="px-2 py-2 text-right font-medium">Einzelpreis €</th>
                <th className="px-2 py-2 text-right font-medium">Gesamtpreis €</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id} className="border-b border-border align-top">
                  <td className="px-2 py-2 tabular-nums">{n + 1}</td>
                  <td className="px-2 py-2 break-words whitespace-pre-line">{i.description}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(i.quantity)}</td>
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
        </div>

        <div className="invoice-summary-block">
          <div className="invoice-closing">
            <div className="mt-3 flex justify-end">
              <div className="w-72 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zwischensumme netto</span>
                  <span>{formatMoney(netTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Umsatzsteuer {formatNumber(vatRate)} %
                  </span>
                  <span>{formatMoney(vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-display text-base font-semibold">
                  <span>Gesamtbetrag</span>
                  <span>{formatMoney(grossTotal)}</span>
                </div>
              </div>
            </div>

            {taxMode !== "domestic" && (
              <p className="mt-4 rounded-md bg-muted p-2.5 text-xs">{REVERSE_CHARGE_NOTE}</p>
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
          fileBaseName: `${DOC_TYPE_LABEL[doc.type]}-${docNumber}`,
        }}
        onSent={async () => {
          setField("status", "sent");
          await supabase
            .from("documents")
            .update({ status: "sent", sent_at: new Date().toISOString() } as never)
            .eq("id", id);
          queryClient.invalidateQueries({ queryKey: ["document", id] });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        }}
      />

    </div>
  );
}
