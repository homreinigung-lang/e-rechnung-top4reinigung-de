import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { saveFile } from "@/lib/download";
import { Download, Upload } from "lucide-react";
import { AccountantAccessCard } from "@/components/AccountantAccessCard";
import { FileUploadButton } from "@/components/FileUploadButton";
import { permanentFileUrl, uploadUserFile } from "@/lib/storage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImagePlus } from "lucide-react";

import { buildSignatureHtml } from "@/lib/signature";
import { DomainDnsCheckCard } from "@/components/DomainDnsCheckCard";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  detectKind,
  mapCustomer,
  mapDocument,
  mapExpense,
  parseCsv,
  readTextAuto,
  toObjects,
} from "@/lib/import-lexware";

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
  void saveFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), name);

}

function Einstellungen() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{
    kind: "documents" | "expenses" | "customers";
    fileName: string;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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
      email_signature_html: String(d["email_signature_html"] ?? ""),
      email_signature_logo_url: String(d["email_signature_logo_url"] ?? ""),
      website_url: String(d["website_url"] ?? ""),
      facebook_url: String(d["facebook_url"] ?? ""),
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

  const KIND_LABEL: Record<string, string> = {
    documents: "Rechnungen",
    expenses: "Ausgaben",
    customers: "Kunden",
  };

  async function importFile(file: File) {
    try {
      const text = await readTextAuto(file);
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("Die Datei enthält keine Datenzeilen.");
        return;
      }
      const objects = toObjects(headers, rows);
      const kind = detectKind(file.name, headers);
      const mapper = kind === "customers" ? mapCustomer : kind === "expenses" ? mapExpense : mapDocument;
      const valid = objects
        .map((o) => mapper(o) as Record<string, unknown> | null)
        .filter(Boolean) as Record<string, unknown>[];

      if (valid.length === 0) {
        toast.error(
          `Keine verwertbaren Zeilen erkannt. Erkannte Spalten: ${headers.filter(Boolean).join(", ")}`,
        );
        return;
      }
      setPreview({ kind, fileName: file.name, rows: valid });
      setPreviewOpen(true);
      toast.success(
        `${valid.length} von ${rows.length} Zeilen erkannt (${KIND_LABEL[kind]}) – bitte in der Vorschau prüfen.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen");
    }
  }

  async function savePreview() {
    if (!preview) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast.error("Nicht angemeldet");
        return;
      }
      const table =
        preview.kind === "customers" ? "customers" : preview.kind === "expenses" ? "expenses" : "documents";
      const { error } = await supabase
        .from(table)
        .insert(preview.rows.map((v) => ({ ...v, user_id: userId })) as never);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${preview.rows.length} ${KIND_LABEL[preview.kind]} importiert`);
      queryClient.invalidateQueries({ queryKey: [table] });
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen");
    } finally {
      setSaving(false);
    }
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
        <div className="space-y-3">
          <Label htmlFor="email_signature">E-Mail-Signatur (Text)</Label>
          <Textarea
            id="email_signature"
            rows={5}
            value={form["email_signature"] ?? ""}
            onChange={(e) => setForm({ ...form, email_signature: e.target.value })}
            placeholder={"Mit freundlichen Grüßen\nHom Reinigung Service\nPoststraße 8, 66333 Völklingen"}
          />
          <p className="text-xs text-muted-foreground">
            Die Signatur wird automatisch unter jede Rechnungs- und Angebots-E-Mail gesetzt.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="font-medium">Firmenlogo in der Signatur</h3>
            <p className="text-xs text-muted-foreground">
              Logo hochladen oder eine Bild-Adresse (URL) einfügen – es erscheint oben in der
              Signatur jeder Rechnungs- und Angebots-E-Mail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FileUploadButton
              folder="signatur"
              accept="image/*"
              label="Logo hochladen"
              onUploaded={async (path) => {
                try {
                  const url = await permanentFileUrl(path);
                  setForm((prev) => ({ ...prev, email_signature_logo_url: url }));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Bild-Adresse konnte nicht erstellt werden");
                }
              }}
            />
            {form["email_signature_logo_url"] && (
              <Button
                variant="ghost"
                onClick={() => setForm({ ...form, email_signature_logo_url: "" })}
              >
                Logo entfernen
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email_signature_logo_url">Bild-Adresse (URL)</Label>
            <Input
              id="email_signature_logo_url"
              placeholder="https://…/logo.png"
              value={form["email_signature_logo_url"] ?? ""}
              onChange={(e) => setForm({ ...form, email_signature_logo_url: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="font-medium">HTML-Signatur (optional)</h3>
            <p className="text-xs text-muted-foreground">
              Hier können Sie eigenen HTML-Code mit Bildern, Links und Formatierung einsetzen. Wenn
              ausgefüllt, ersetzt dieser Block die Text-Signatur. Skripte werden aus
              Sicherheitsgründen entfernt.
            </p>
          </div>
          <Textarea
            id="email_signature_html"
            rows={8}
            className="font-mono text-xs"
            value={form["email_signature_html"] ?? ""}
            onChange={(e) => setForm({ ...form, email_signature_html: e.target.value })}
            placeholder={'<p><strong>Hom Reinigung Service</strong><br />Poststraße 8, 66333 Völklingen</p>\n<img src="https://…/banner.png" alt="Logo" style="max-height:70px" />'}
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={signatureImageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void insertSignatureImage(file);
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ImagePlus className="size-4" /> Bild-Optionen
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onSelect={() => signatureImageInput.current?.click()}>
                  Bild hochladen &amp; einfügen
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const url = window.prompt("Bild-Adresse (URL) eingeben:", "https://");
                    if (!url || !/^https?:\/\//i.test(url)) return;
                    appendSignatureImage(url);
                  }}
                >
                  Bild per URL einfügen
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => appendSignatureImage("BILD-URL-HIER")}>
                  Platzhalter einfügen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setForm((prev) => ({
                      ...prev,
                      email_signature_html: String(prev["email_signature_html"] ?? "").replace(
                        /\n?<img[^>]*>/gi,
                        "",
                      ),
                    }))
                  }
                >
                  Alle Bilder entfernen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label>Vorschau</Label>
            <div
              className="rounded-md border bg-white p-4 text-sm text-black"
              // Vorschau der bereinigten Signatur
              dangerouslySetInnerHTML={{ __html: buildSignatureHtml(form) || "<em>Keine Signatur hinterlegt</em>" }}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="website_url">Website (Link in der Signatur)</Label>
            <Input
              id="website_url"
              placeholder="https://www.hom-reinigung.de"
              value={form["website_url"] ?? ""}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebook_url">Facebook / Social Media</Label>
            <Input
              id="facebook_url"
              placeholder="https://www.facebook.com/homreinigung"
              value={form["facebook_url"] ?? ""}
              onChange={(e) => setForm({ ...form, facebook_url: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Beide Adressen erscheinen in der E-Mail als blaue, anklickbare Links – wie eine
          professionelle Gmail-Signatur.
        </p>

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
          <Button asChild>
            <Link to="/steuerberater">Steuerberater-Bereich öffnen (DATEV, Excel, PDF)</Link>
          </Button>
        </div>

      </div>

      <AccountantAccessCard />

      <DomainDnsCheckCard />

      <div className="surface space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Import aus Lexoffice / Lexware</h2>
        <p className="text-sm text-muted-foreground">
          Datei auswählen – der Typ wird automatisch erkannt: Rechnungen (z. B. Export_RE_…) landen
          unter „Rechnungen“, Ausgaben (z. B. Export_RA_…) unter „Ausgaben“, Kundenlisten im
          Kundenstamm. Trennzeichen (; , Tab |), Kodierung (UTF-8 / Windows-1252 / ISO-8859-1) und
          abweichende Spaltennamen werden automatisch erkannt; unbekannte Spalten werden
          übersprungen.
        </p>
        <Label
          htmlFor="csv"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Upload className="size-4" /> Datei importieren (Rechnungen, Ausgaben oder Kunden)
        </Label>
        <input
          id="csv"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
        {preview && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <span>
              <strong>{preview.rows.length}</strong> Zeilen erkannt ({KIND_LABEL[preview.kind]}) aus{" "}
              {preview.fileName}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              Vorschau
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(o) => setPreviewOpen(o)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Vorschau: {preview ? `${preview.rows.length} ${KIND_LABEL[preview.kind]}` : ""}
            </DialogTitle>
          </DialogHeader>
          {preview && preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    {Object.keys(preview.rows[0]!).map((k) => (
                      <th key={k} className="whitespace-nowrap px-2 py-2 font-medium">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Object.keys(preview.rows[0]!).map((k) => (
                        <td key={k} className="whitespace-nowrap px-2 py-1.5">
                          {String(r[k] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  … {preview.rows.length - 50} weitere Zeilen
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewOpen(false);
                setPreview(null);
              }}
            >
              Verwerfen
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                await savePreview();
                setPreviewOpen(false);
              }}
            >
              {saving ? "Speichern…" : "Jetzt importieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
