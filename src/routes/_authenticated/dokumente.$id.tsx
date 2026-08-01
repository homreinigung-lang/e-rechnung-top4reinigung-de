import { createFileRoute, Link } from "@tanstack/react-router";
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
  NO_VAT_NOTE,
  REVERSE_CHARGE_NOTE,
  STATUS_LABEL,
  formatDate,
  formatMoney,
} from "@/lib/format";
import { ArrowLeft, Mail, Plus, Printer, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dokumente/$id")({
  head: () => ({
    meta: [
      { title: "Dokument bearbeiten – Rechnungen & Angebote" },
      {
        name: "description",
        content: "Positionen erfassen, Reverse-Charge-Hinweis prüfen, drucken und per E-Mail senden.",
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

  useEffect(() => {
    if (!data) return;
    const d = data.doc;
    setForm({
      status: d.status,
      issue_date: d.issue_date,
      due_date: d.due_date,
      customer_id: d.customer_id,
      customer_name: d.customer_name,
      customer_company: d.customer_company,
      customer_email: d.customer_email,
      customer_address_line: d.customer_address_line,
      customer_postal_code: d.customer_postal_code,
      customer_city: d.customer_city,
      customer_country: d.customer_country,
      customer_vat_id: d.customer_vat_id,
      reverse_charge: d.reverse_charge,
      intro_text: d.intro_text,
      notes: d.notes,
    });
    setItems(
      data.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      })),
    );
  }, [data]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
    [items],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      const { error: docError } = await supabase
        .from("documents")
        .update({ ...form, total } as never)
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

  if (isLoading || !data) {
    return <p className="text-muted-foreground">Wird geladen…</p>;
  }

  const doc = data.doc;
  const settings = data.settings;
  const isInvoice = doc.type === "invoice";

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

  function mailto() {
    const to = String(form["customer_email"] ?? "");
    if (!to) {
      toast.error("Bitte zuerst eine E-Mail-Adresse des Kunden hinterlegen.");
      return;
    }
    const label = DOC_TYPE_LABEL[doc.type];
    const subject = `${label} ${doc.number} – ${settings?.company_name ?? "Hom Reinigung Service"}`;
    const lines = [
      `Sehr geehrte Damen und Herren,`,
      ``,
      `anbei erhalten Sie ${isInvoice ? "unsere Rechnung" : "unser Angebot"} ${doc.number} vom ${formatDate(String(form["issue_date"] ?? doc.issue_date))}.`,
      ``,
      ...items.map(
        (i, n) =>
          `${n + 1}. ${i.description} – ${i.quantity} ${i.unit} × ${formatMoney(i.unit_price)} = ${formatMoney(i.quantity * i.unit_price)}`,
      ),
      ``,
      `Gesamtbetrag: ${formatMoney(total)}`,
      form["reverse_charge"] ? REVERSE_CHARGE_NOTE : NO_VAT_NOTE,
      ``,
      isInvoice && form["due_date"]
        ? `Zahlbar bis ${formatDate(String(form["due_date"]))} ohne Abzug.`
        : "",
      ``,
      `Mit freundlichen Grüßen`,
      settings?.company_name ?? "Hom Reinigung Service",
      settings?.phone ?? "",
    ].filter(Boolean);
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
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
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Drucken / PDF
          </Button>
          <Button variant="outline" onClick={mailto}>
            <Mail className="size-4" /> Per E-Mail senden
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" /> Speichern
          </Button>
        </div>
      </div>

      <div className="no-print surface space-y-6 p-6">
        <h2 className="font-display text-xl font-semibold">
          {DOC_TYPE_LABEL[doc.type]} {doc.number} bearbeiten
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
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
            <Label>Datum</Label>
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
                placeholder="Leistung (z. B. Unterhaltsreinigung Büro)"
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
          <div className="text-right font-display text-lg font-semibold">
            Gesamt: {formatMoney(total)}
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

      {/* Druckansicht */}
      <article className="paper print-area mx-auto w-full max-w-3xl p-10 text-sm">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold">
              {settings?.company_name ?? "Hom Reinigung Service"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {[settings?.address_line, `${settings?.postal_code ?? ""} ${settings?.city ?? ""}`.trim(), settings?.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {settings?.email && <div>{settings.email}</div>}
            {settings?.phone && <div>{settings.phone}</div>}
            <div>USt-IdNr.: {settings?.vat_id ?? "DE458492078"}</div>
            <div>Steuernummer: {settings?.tax_number ?? "040/200/01653"}</div>
          </div>
        </header>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <address className="not-italic">
            <div className="text-xs text-muted-foreground">Rechnungsempfänger</div>
            <div className="mt-1 font-medium">{String(form["customer_company"] ?? "")}</div>
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
              <dd className="inline font-medium">{doc.number}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Datum: </dt>
              <dd className="inline">{formatDate(String(form["issue_date"] ?? ""))}</dd>
            </div>
            {isInvoice && form["due_date"] && (
              <div>
                <dt className="inline text-muted-foreground">Fällig am: </dt>
                <dd className="inline">{formatDate(String(form["due_date"]))}</dd>
              </div>
            )}
          </dl>
        </div>

        <h2 className="mt-10 font-display text-xl font-semibold">
          {DOC_TYPE_LABEL[doc.type]} {doc.number}
        </h2>
        {form["intro_text"] && <p className="mt-2">{String(form["intro_text"])}</p>}

        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-xs text-muted-foreground uppercase">
              <th className="py-2">Pos.</th>
              <th className="py-2">Leistung</th>
              <th className="py-2 text-right">Menge</th>
              <th className="py-2 text-right">Einzelpreis</th>
              <th className="py-2 text-right">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id} className="border-b align-top">
                <td className="py-2">{n + 1}</td>
                <td className="py-2">{i.description}</td>
                <td className="py-2 text-right">
                  {i.quantity} {i.unit}
                </td>
                <td className="py-2 text-right">{formatMoney(i.unit_price)}</td>
                <td className="py-2 text-right">{formatMoney(i.quantity * i.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nettobetrag</span>
              <span>{formatMoney(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Umsatzsteuer</span>
              <span>0,00 €</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-display text-base font-semibold">
              <span>Gesamtbetrag</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>
        </div>

        <p className="mt-6 rounded-md bg-muted p-3 text-xs">
          {form["reverse_charge"] ? REVERSE_CHARGE_NOTE : NO_VAT_NOTE}
        </p>

        {form["notes"] && <p className="mt-4">{String(form["notes"])}</p>}

        {isInvoice && (settings?.iban || settings?.bank_name) && (
          <p className="mt-6 text-xs text-muted-foreground">
            Bitte überweisen Sie den Gesamtbetrag auf folgendes Konto: {settings?.bank_name} ·
            IBAN {settings?.iban} {settings?.bic ? `· BIC ${settings.bic}` : ""}
          </p>
        )}
      </article>
    </div>
  );
}
