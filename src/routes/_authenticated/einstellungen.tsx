import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – E-Mail, Export & Import" },
      {
        name: "description",
        content: "SMTP-Zugang, E-Mail-Signatur, DATEV-Export für den Steuerberater und CSV-Import.",
      },
      { property: "og:title", content: "Systemeinstellungen" },
      { property: "og:description", content: "E-Mail, Steuerberater-Export und Datenimport." },
    ],
  }),
  component: Einstellungen,
});

const SMTP_FIELDS = [
  { key: "smtp_host", label: "SMTP-Server" },
  { key: "smtp_port", label: "Port" },
  { key: "smtp_user", label: "Benutzername" },
  { key: "smtp_from", label: "Absenderadresse" },
] as const;

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    toast.error("Keine Daten im gewählten Zeitraum.");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Einstellungen() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const d = data as Record<string, unknown>;
    setForm({
      smtp_host: String(d["smtp_host"] ?? ""),
      smtp_port: String(d["smtp_port"] ?? "587"),
      smtp_user: String(d["smtp_user"] ?? ""),
      smtp_from: String(d["smtp_from"] ?? ""),
      email_signature: String(d["email_signature"] ?? ""),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("company_settings").upsert(
        {
          ...form,
          smtp_port: Number(form["smtp_port"] || 587),
          user_id: userId,
        } as never,
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Einstellungen gespeichert");
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function exportDocuments() {
    const { data: docs, error } = await supabase
      .from("documents")
      .select("*")
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date");
    if (error) { toast.error(error.message); return; }
    downloadCsv(
      `Rechnungen_${from}_${to}.csv`,
      (docs ?? []).map((d) => ({
        Belegdatum: formatDate(d.issue_date),
        Belegnummer: d.number,
        Belegart: d.type === "invoice" ? "Rechnung" : "Angebot",
        Kunde: d.customer_company || d.customer_name,
        Bestellnummer: (d as Record<string, unknown>)["order_number"] ?? "",
        Netto: Number((d as Record<string, unknown>)["net_total"] ?? d.total)
          .toFixed(2)
          .replace(".", ","),
        Umsatzsteuer: Number((d as Record<string, unknown>)["vat_amount"] ?? 0)
          .toFixed(2)
          .replace(".", ","),
        Brutto: Number(d.total).toFixed(2).replace(".", ","),
        Steuerart:
          (d as Record<string, unknown>)["tax_mode"] === "domestic" ? "19% Inland" : "Reverse-Charge",
        Status: d.status,
      })),
    );
  }

  async function exportExpenses() {
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date");
    if (error) { toast.error(error.message); return; }
    downloadCsv(
      `Ausgaben_${from}_${to}.csv`,
      (rows ?? []).map((e) => ({
        Belegdatum: formatDate(e.expense_date),
        Belegnummer: e.document_number,
        Lieferant: e.supplier,
        Kategorie: e.category,
        Netto: Number(e.net_amount).toFixed(2).replace(".", ","),
        Umsatzsteuer: Number(e.vat_amount).toFixed(2).replace(".", ","),
        Brutto: Number(e.gross_amount).toFixed(2).replace(".", ","),
        Notiz: e.notes,
      })),
    );
  }

  async function importCustomers(file: File) {
    const text = await file.text();
    const [headerLine, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
    if (!headerLine) { toast.error("Leere Datei."); return; }
    const sep = headerLine.includes(";") ? ";" : ",";
    const headers = headerLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const map: Record<string, string> = {
      firma: "company",
      company: "company",
      name: "name",
      ansprechpartner: "name",
      email: "email",
      "e-mail": "email",
      telefon: "phone",
      phone: "phone",
      straße: "address_line",
      strasse: "address_line",
      adresse: "address_line",
      plz: "postal_code",
      ort: "city",
      stadt: "city",
      land: "country",
      "ust-idnr.": "vat_id",
      "ust-idnr": "vat_id",
      ustid: "vat_id",
      notizen: "notes",
    };
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) { toast.error("Nicht angemeldet"); return; }

    const rows = lines.map((line) => {
      const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = { user_id: userId };
      headers.forEach((h, i) => {
        const key = map[h];
        if (key) row[key] = cells[i] ?? "";
      });
      return row;
    });
    const valid = rows.filter((r) => r["company"] || r["name"]);
    if (valid.length === 0) { toast.error("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("customers").insert(valid as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`${valid.length} Kunden importiert`);
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Einstellungen</h1>
        <p className="mt-1 text-muted-foreground">
          E-Mail-Versand, Steuerberater-Export und Datenimport. Firmendaten finden Sie unter „Mein
          Profil“.
        </p>
      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">E-Mail (SMTP) & Signatur</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SMTP_FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email_signature">E-Mail-Signatur</Label>
          <Textarea
            id="email_signature"
            rows={5}
            value={form["email_signature"] ?? ""}
            onChange={(e) => setForm({ ...form, email_signature: e.target.value })}
            placeholder={"Mit freundlichen Grüßen\nHom Reinigung Service\nPoststr 8, 66333 Völklingen"}
          />
          <p className="text-xs text-muted-foreground">
            Die Signatur wird automatisch unter jede Rechnungs- und Angebots-E-Mail gesetzt.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Speichern
        </Button>
      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Steuerberater-Export (DATEV/CSV)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="from">Von</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Bis</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportDocuments}>
            <Download className="size-4" /> Rechnungen exportieren
          </Button>
          <Button variant="outline" onClick={exportExpenses}>
            <Download className="size-4" /> Ausgaben exportieren
          </Button>
        </div>
      </div>

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Import (z. B. aus Lexoffice)</h2>
        <p className="text-sm text-muted-foreground">
          CSV-Datei mit Spalten wie Firma, Ansprechpartner, E-Mail, Straße, PLZ, Ort, Land,
          USt-IdNr.
        </p>
        <Label
          htmlFor="csv"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Upload className="size-4" /> Kunden aus CSV importieren
        </Label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importCustomers(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
