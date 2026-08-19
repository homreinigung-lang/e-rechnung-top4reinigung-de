import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate, formatMoney, today } from "@/lib/format";
import { FileUploadButton } from "@/components/FileUploadButton";
import { receiptFileToPdf } from "@/lib/receipt-pdf";
import { downloadStoredFile, uploadUserFile } from "@/lib/storage";
import { DateiVorschau } from "@/components/DateiVorschau";
import { scanReceipt } from "@/lib/receipt-scan.functions";
import { readIncomingEInvoice, type IncomingEInvoice } from "@/lib/e-invoice-import";
import {
  Download,
  Eye,
  FileCode2,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ausgaben")({
  head: () => ({
    meta: [
      { title: "Ausgaben & Eingangsrechnungen erfassen" },
      {
        name: "description",
        content: "Eingangsrechnungen und Betriebsausgaben erfassen und Einnahmen-Überschuss sehen.",
      },
      { property: "og:title", content: "Ausgaben & Eingangsrechnungen" },
      { property: "og:description", content: "Einnahmen und Ausgaben gegenüberstellen." },
    ],
  }),
  component: Ausgaben,
});

const CATEGORIES = [
  "Material",
  "Reinigungsmittel",
  "Fahrzeug",
  "Löhne",
  "Miete",
  "Versicherung",
  "Sonstiges",
];

type Form = {
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  net_amount: string;
  vat_amount: string;
  notes: string;
  receipt_url: string;
};

const empty: Form = {
  supplier: "",
  expense_date: today(),
  category: "Sonstiges",
  document_number: "",
  net_amount: "",
  vat_amount: "",
  notes: "",
  receipt_url: "",
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function Ausgaben() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(empty);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [eInvoice, setEInvoice] = useState<IncomingEInvoice | null>(null);
  const [importing, setImporting] = useState(false);

  /** Eingehende E-Rechnung (XRechnung/ZUGFeRD) einlesen und die Felder vorbelegen. */
  async function handleEInvoice(path: string, file: File) {
    setImporting(true);
    try {
      const inv = await readIncomingEInvoice(file);
      setEInvoice(inv);
      setScanned(false);
      setForm((f) => ({
        ...f,
        receipt_url: path,
        supplier: inv.supplier || f.supplier,
        document_number: inv.document_number || f.document_number,
        expense_date: inv.issue_date || f.expense_date,
        net_amount: inv.net_amount ? inv.net_amount.toFixed(2) : f.net_amount,
        vat_amount: inv.vat_amount ? inv.vat_amount.toFixed(2) : f.vat_amount,
        notes: [
          `E-Rechnung ${inv.format}`,
          inv.supplier_vat_id ? `USt-IdNr. ${inv.supplier_vat_id}` : "",
          inv.notes,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
      toast.success(`${inv.format} eingelesen`, {
        description: "Beträge und Datum wurden übernommen – bitte kurz prüfen.",
      });
    } catch (e) {
      setForm((f) => ({ ...f, receipt_url: path }));
      toast.error(e instanceof Error ? e.message : "E-Rechnung konnte nicht gelesen werden.");
    } finally {
      setImporting(false);
    }
  }
  const runScan = useServerFn(scanReceipt);

  /** Nimmt den Upload entgegen: Beleg auslesen und Fotos sofort in ein PDF wandeln. */
  async function handleReceipt(path: string, file: File) {
    setForm((f) => ({ ...f, receipt_url: path }));
    const scan = await analyze(file);
    if (!file.type.startsWith("image/")) return;
    try {
      const pdfFile = await receiptFileToPdf(file, {
        date: scan?.expense_date || form.expense_date || today(),
        category: scan?.category || form.category,
        ...(scan?.supplier ? { supplier: scan.supplier } : {}),
      });
      const pdfPath = await uploadUserFile(pdfFile, "belege");
      setForm((f) => ({ ...f, receipt_url: pdfPath }));
      toast.success("Beleg-Foto wurde automatisch in ein PDF umgewandelt");
    } catch {
      toast.error("PDF-Umwandlung fehlgeschlagen – das Foto bleibt als Beleg hinterlegt.");
    }
  }

  /** Liest den hochgeladenen Beleg aus und füllt die Felder vor. */
  async function analyze(file: File) {
    setScanning(true);
    setScanned(false);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await runScan({
        data: { dataUrl, mimeType: file.type || "application/pdf" },
      });
      setForm((f) => ({
        ...f,
        supplier: r.supplier || f.supplier,
        document_number: r.document_number || f.document_number,
        expense_date: r.expense_date || f.expense_date,
        net_amount: r.net_amount ? String(r.net_amount.toFixed(2)) : f.net_amount,
        vat_amount: r.vat_amount ? String(r.vat_amount.toFixed(2)) : f.vat_amount,
        category: CATEGORIES.includes(r.category) ? r.category : f.category,
        notes: r.notes || f.notes,
      }));
      setScanned(true);
      toast.success("Belegdaten erkannt", {
        description: "Bitte Beträge und Datum kurz prüfen.",
      });
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beleg konnte nicht ausgelesen werden.");
      return null;
    } finally {
      setScanning(false);
    }
  }

  const { data: rows = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const net = Number(form.net_amount || 0);
      const vat = Number(form.vat_amount || 0);
      const { error } = await supabase.from("expenses").insert({
        user_id: userId,
        supplier: form.supplier,
        expense_date: form.expense_date,
        category: form.category,
        document_number: form.document_number,
        net_amount: net,
        vat_amount: vat,
        gross_amount: net + vat,
        notes: form.notes,
        receipt_url: form.receipt_url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ausgabe erfasst");
      setForm({ ...empty, expense_date: today(), receipt_url: "" });
      setScanned(false);
      setEInvoice(null);

      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("trash_entity", { _entity: "expense", _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalNet = rows.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalGross = rows.reduce((s, r) => s + Number(r.gross_amount), 0);
  const totalVat = rows.reduce((s, r) => s + Number(r.vat_amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ausgaben & Eingangsrechnungen</h1>
        <p className="mt-1 text-muted-foreground">
          Betriebsausgaben erfassen und Vorsteuer sowie Ergebnis auswerten.
        </p>
      </div>

      <div className="surface space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="supplier">Lieferant</Label>
            <Input
              id="supplier"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense_date">Belegdatum</Label>
            <Input
              id="expense_date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Kategorie</Label>
            <select
              id="category"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_number">Belegnummer</Label>
            <Input
              id="document_number"
              value={form.document_number}
              onChange={(e) => setForm({ ...form, document_number: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="net_amount">Netto €</Label>
            <Input
              id="net_amount"
              type="number"
              step="0.01"
              value={form.net_amount}
              onChange={(e) => setForm({ ...form, net_amount: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat_amount">Umsatzsteuer €</Label>
            <Input
              id="vat_amount"
              type="number"
              step="0.01"
              value={form.vat_amount}
              onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FileUploadButton
            folder="belege"
            accept="image/*,application/pdf"
            label="Beleg fotografieren/hochladen – wird als PDF gespeichert"
            onUploaded={(path, file) => void handleReceipt(path, file)}
          />
          <FileUploadButton
            folder="e-rechnungen"
            accept=".xml,application/xml,text/xml,application/pdf"
            label="E-Rechnung empfangen (XRechnung/ZUGFeRD)"
            onUploaded={(path, file) => void handleEInvoice(path, file)}
          />
          {importing && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> E-Rechnung wird gelesen…
            </span>
          )}
          {!importing && eInvoice && (
            <span className="inline-flex items-center gap-1 text-sm text-primary">
              <FileCode2 className="size-4" /> {eInvoice.format} · Nr. {eInvoice.document_number} ·{" "}
              {formatMoney(eInvoice.gross_amount)}
            </span>
          )}
          {scanning && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Beleg wird ausgelesen…
            </span>
          )}
          {!scanning && form.receipt_url && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Paperclip className="size-4" /> Beleg angehängt & mit der Ausgabe verknüpft
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-7"
                onClick={() => setPreview(form.receipt_url)}
              >
                <Eye className="mr-1 size-4" /> Ansehen
              </Button>
            </span>
          )}
          {!scanning && scanned && (
            <span className="inline-flex items-center gap-1 text-sm text-primary">
              <Sparkles className="size-4" /> Daten automatisch übernommen – bitte prüfen
            </span>
          )}
        </div>

        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4" /> Ausgabe speichern
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Ausgaben netto", value: totalNet },
          { label: "Vorsteuer", value: totalVat },
          { label: "Ausgaben brutto", value: totalGross },
        ].map((s) => (
          <div key={s.label} className="surface p-5">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-2 font-display text-2xl font-semibold">{formatMoney(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Noch keine Ausgaben erfasst.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <ExpenseRow
                key={r.id}
                row={r as never}
                onDelete={() => remove.mutate(r.id)}
                onPreview={(path) => setPreview(path)}
              />
            ))}
          </ul>
        )}
      </div>

      <DateiVorschau path={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

type ExpenseRowData = {
  id: string;
  supplier: string;
  expense_date: string;
  category: string;
  document_number: string;
  gross_amount: number;
  net_amount: number;
  receipt_url: string;
};

function ExpenseRow({
  row: r,
  onDelete,
  onPreview,
}: {
  row: ExpenseRowData;
  onDelete: () => void;
  onPreview: (path: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <div className="flex-1">
        <div className="font-medium">{r.supplier || "Ohne Lieferant"}</div>
        <div className="text-sm text-muted-foreground">
          {formatDate(r.expense_date)} · {r.category}
          {r.document_number ? ` · ${r.document_number}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{formatMoney(Number(r.gross_amount))}</div>
        <div className="text-xs text-muted-foreground">
          netto {formatMoney(Number(r.net_amount))}
        </div>
      </div>
      {r.receipt_url && (
        <>
          <Button
            variant="ghost"
            size="icon"
            title="Beleg ansehen"
            onClick={() => onPreview(r.receipt_url)}
          >
            <Eye className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Beleg herunterladen"
            onClick={() =>
              void downloadStoredFile(r.receipt_url).catch(() =>
                toast.error("Beleg konnte nicht geladen werden."),
              )
            }
          >
            <Download className="size-4" />
          </Button>
        </>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ausgabe wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Die Ausgabe „${r.supplier || "ohne Lieferant"}" vom ${formatDate(
                r.expense_date,
              )} wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={onDelete}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
