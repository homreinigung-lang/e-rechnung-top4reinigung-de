import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { ReceiptScannerButton } from "@/components/ReceiptScannerButton";
import { receiptFileToPdf } from "@/lib/receipt-pdf";
import { downloadStoredFile, fetchStoredBlob, uploadUserFile } from "@/lib/storage";
import { DateiVorschau } from "@/components/DateiVorschau";
import { WiederkehrendeAusgaben } from "@/components/WiederkehrendeAusgaben";
import { scanReceipt } from "@/lib/receipt-scan.functions";
import { receiptFormValues } from "@/lib/receipt-form";
import { findDuplicateExpense } from "@/lib/expense-duplicate";
import { buildExpenseReceiptZip } from "@/lib/expense-receipt-export";
import { saveFile } from "@/lib/download";
import { readIncomingEInvoice, type IncomingEInvoice } from "@/lib/e-invoice-import";
import { Download, Eye, FileArchive, FileCode2, Loader2, Paperclip, Plus, Sparkles, Trash2 } from "lucide-react";

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
  "Sozialabgaben / Arbeitgeberabgaben",
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
  project_id: string;
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
  project_id: "",
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
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [receiptToRetry, setReceiptToRetry] = useState<File | null>(null);
  const [scanError, setScanError] = useState("");
  const [duplicateExpense, setDuplicateExpense] = useState<ExpenseRowData | null>(null);
  const currentYear = Number(today().slice(0, 4));
  const currentQuarter = Math.floor((Number(today().slice(5, 7)) - 1) / 3) + 1;
  const [filterYear, setFilterYear] = useState(currentYear);
  const [periodMode, setPeriodMode] = useState<"quarter" | "year" | "custom">("quarter");
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());

  /** Eingehende E-Rechnung (XRechnung/ZUGFeRD) einlesen und die Felder vorbelegen. */
  async function handleEInvoice(path: string, file: File) {
    setScanError("");
    setReceiptToRetry(null);
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
        net_amount: inv.net_amount.toFixed(2),
        vat_amount: inv.vat_amount.toFixed(2),
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

  /** Beleg auslesen und genau eine endgültige Datei im Storage speichern. */
  async function handleReceipt(file: File) {
    setEInvoice(null);
    setReceiptToRetry(file);
    const scan = await analyze(file);

    try {
      const storedFile = file.type.startsWith("image/")
        ? await receiptFileToPdf(file, {
            date: scan?.expense_date || form.expense_date || today(),
            category: scan?.category || form.category,
            ...(scan?.supplier ? { supplier: scan.supplier } : {}),
          })
        : file;
      const path = await uploadUserFile(storedFile, "belege");
      setForm((f) => ({ ...f, receipt_url: path }));
    } catch {
      toast.error("Beleg konnte nicht gespeichert werden.");
    }
  }

  /** Liest den hochgeladenen Beleg aus und füllt die Felder vor. */
  async function analyze(file: File) {
    setScanning(true);
    setScanned(false);
    setScanError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await runScan({
        data: { dataUrl, mimeType: file.type || "application/pdf" },
      });
      const values = receiptFormValues(r);
      setForm((f) => ({
        ...f,
        supplier: values.supplier || f.supplier,
        document_number: values.document_number || f.document_number,
        expense_date: values.expense_date || f.expense_date,
        net_amount: values.net_amount,
        vat_amount: values.vat_amount,
        category: CATEGORIES.includes(values.category) ? values.category : f.category,
        notes: values.notes || f.notes,
      }));
      setScanned(true);
      toast.success("Belegdaten erkannt", {
        description:
          "Felder wurden ausgefüllt. Bitte prüfen und mit „Ausgabe speichern“ übernehmen.",
      });
      return r;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Beleg konnte nicht ausgelesen werden.";
      setScanError(message);
      toast.error(message);
      return null;
    } finally {
      setScanning(false);
    }
  }

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "expense-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,city,status")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

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
        project_id: form.project_id || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ausgabe erfasst");
      setForm({ ...empty, expense_date: today(), receipt_url: "", project_id: "" });
      setScanned(false);
      setEInvoice(null);
      setReceiptToRetry(null);
      setScanError("");

      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attachReceipt = useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string }) => {
      const { error } = await supabase
        .from("expenses")
        .update({ receipt_url: path })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Beleg gespeichert");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
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

  const { periodFrom, periodTo, periodLabel } = useMemo(() => {
    if (periodMode === "custom") {
      return { periodFrom: customFrom, periodTo: customTo, periodLabel: `${customFrom}_${customTo}` };
    }
    if (periodMode === "year") {
      return { periodFrom: `${filterYear}-01-01`, periodTo: `${filterYear}-12-31`, periodLabel: `Jahr_${filterYear}` };
    }
    const startMonth = (selectedQuarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const pad = (value: number) => String(value).padStart(2, "0");
    const lastDay = new Date(Date.UTC(filterYear, endMonth, 0)).getUTCDate();
    return {
      periodFrom: `${filterYear}-${pad(startMonth)}-01`,
      periodTo: `${filterYear}-${pad(endMonth)}-${pad(lastDay)}`,
      periodLabel: `Q${selectedQuarter}_${filterYear}`,
    };
  }, [periodMode, filterYear, selectedQuarter, customFrom, customTo]);

  const filteredRows = rows.filter((row) => {
    const date = String(row.expense_date ?? "");
    return date >= periodFrom && date <= periodTo;
  });
  const exportRows = filteredRows;

  const receiptExport = useMutation({
    mutationFn: async () => {
      if (!periodFrom || !periodTo || periodFrom > periodTo) {
        throw new Error("Bitte einen gültigen Zeitraum auswählen.");
      }
      if (exportRows.length === 0) {
        throw new Error("Keine Ausgaben im gewählten Zeitraum.");
      }
      const result = await buildExpenseReceiptZip({
        expenses: exportRows,
        loadReceipt: async (row) => {
          const path = String(row.receipt_url ?? "");
          if (!path) throw new Error("Beleg fehlt");
          return fetchStoredBlob(path);
        },
      });
      await saveFile(result.blob, `Ausgabenbelege_${periodLabel}.zip`);
      return result;
    },
    onSuccess: (result) =>
      toast.success(
        `${result.receiptCount} Belege geladen · ${result.expenseCount} Ausgaben in der Übersicht`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  function saveWithDuplicateCheck() {
    const duplicate = findDuplicateExpense(
      form,
      rows as unknown as ExpenseRowData[],
    );
    if (duplicate) {
      setDuplicateExpense(duplicate);
      return;
    }
    add.mutate();
  }

  const totalNet = filteredRows.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalGross = filteredRows.reduce((s, r) => s + Number(r.gross_amount), 0);
  const totalVat = filteredRows.reduce((s, r) => s + Number(r.vat_amount), 0);

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
            <Label htmlFor="project_id">Objekt / Projekt</Label>
            <select
              id="project_id"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            >
              <option value="">Nicht zugeordnet</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Ohne Namen"}
                  {p.city ? ` · ${p.city}` : ""}
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
          <ReceiptScannerButton
            label="Beleg fotografieren/hochladen – wird als PDF gespeichert"
            onProcessed={handleReceipt}
            disabled={processingReceipt || add.isPending}
            onBusyChange={setProcessingReceipt}
          />
          <FileUploadButton
            folder="e-rechnungen"
            accept=".xml,application/xml,text/xml,application/pdf"
            label="E-Rechnung empfangen (XRechnung/ZUGFeRD)"
            validateFile={async (file) => {
              await readIncomingEInvoice(file);
            }}
            onUploaded={handleEInvoice}
            showSuccessToast={false}
            disabled={processingReceipt || add.isPending}
            onBusyChange={setProcessingReceipt}
          />
          {receiptToRetry && !scanned && !processingReceipt && (
            <Button
              type="button"
              variant="outline"
              disabled={add.isPending}
              onClick={async () => {
                setProcessingReceipt(true);
                try {
                  await analyze(receiptToRetry);
                } finally {
                  setProcessingReceipt(false);
                }
              }}
            >
              <Sparkles className="size-4" /> Erneut auslesen
            </Button>
          )}
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
              <Paperclip className="size-4" /> Beleg angehängt – Ausgabe noch nicht gespeichert
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
              <Sparkles className="size-4" /> Daten erkannt – bitte prüfen und „Ausgabe speichern“
              wählen
            </span>
          )}
        </div>

        {scanError && (
          <p role="alert" className="text-sm text-destructive">
            {scanError}
          </p>
        )}
        <Button onClick={saveWithDuplicateCheck} disabled={add.isPending || processingReceipt}>
          <Plus className="size-4" /> Ausgabe speichern
        </Button>

        <AlertDialog
          open={duplicateExpense !== null}
          onOpenChange={(open) => {
            if (!open) setDuplicateExpense(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mögliche doppelte Ausgabe</AlertDialogTitle>
              <AlertDialogDescription>
                {duplicateExpense
                  ? `Es gibt bereits eine Ausgabe von „${duplicateExpense.supplier || "ohne Lieferant"}" am ${formatDate(
                      duplicateExpense.expense_date,
                    )} über ${formatMoney(Number(duplicateExpense.gross_amount))}. Bitte prüfen, bevor Sie dieselbe Ausgabe noch einmal speichern.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDuplicateExpense(null)}>
                Nicht speichern
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDuplicateExpense(null);
                  add.mutate();
                }}
              >
                Trotzdem speichern
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

      <div className="surface space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Zeitraum & Ausgabenbelege</h2>
          <p className="text-sm text-muted-foreground">
            Liste, Summen und Beleg-Download verwenden immer denselben gewählten Zeitraum.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="filter-year">Jahr</Label>
            <Input id="filter-year" type="number" min="2000" max="2100" value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))} disabled={periodMode === "custom"} />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <Label>Zeitraum</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((quarter) => (
                <Button key={quarter} type="button"
                  variant={periodMode === "quarter" && selectedQuarter === quarter ? "default" : "outline"}
                  onClick={() => { setSelectedQuarter(quarter); setPeriodMode("quarter"); }}>
                  Q{quarter}
                </Button>
              ))}
              <Button type="button" variant={periodMode === "year" ? "default" : "outline"} onClick={() => setPeriodMode("year")}>
                Gesamtjahr
              </Button>
              <Button type="button" variant={periodMode === "custom" ? "default" : "outline"} onClick={() => setPeriodMode("custom")}>
                Eigener Zeitraum
              </Button>
            </div>
          </div>
          {periodMode === "custom" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="custom-from">Von</Label>
                <Input id="custom-from" type="date" value={customFrom} max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-to">Bis</Label>
                <Input id="custom-to" type="date" value={customTo} min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => receiptExport.mutate()}
            disabled={receiptExport.isPending || exportRows.length === 0 || periodFrom > periodTo}>
            {receiptExport.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />}
            Alle Belege für Steuerberater herunterladen
          </Button>
          <span className="text-sm text-muted-foreground">
            {exportRows.length === 0 ? "Keine Ausgaben im gewählten Zeitraum." :
              `${exportRows.length} Ausgaben ausgewählt · ${exportRows.filter((row) => Boolean(row.receipt_url)).length} mit Beleg`}
          </span>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {filteredRows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Keine Ausgaben im gewählten Zeitraum.
          </p>
        ) : (
          <ul className="divide-y">
            {filteredRows.map((r) => (
              <ExpenseRow
                key={r.id}
                row={r as never}
                onDelete={() => remove.mutate(r.id)}
                onPreview={(path) => setPreview(path)}
                onAttach={(path) => attachReceipt.mutateAsync({ id: r.id, path })}
              />
            ))}
          </ul>
        )}
      </div>

      <WiederkehrendeAusgaben categories={CATEGORIES} />

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
  onAttach,
}: {
  row: ExpenseRowData;
  onDelete: () => void;
  onPreview: (path: string) => void;
  onAttach: (path: string) => Promise<unknown>;
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
      <FileUploadButton
        folder="belege"
        accept=".pdf,application/pdf,image/*"
        label={r.receipt_url ? "Beleg ersetzen" : "Beleg hinzufügen"}
        prepareFile={async (file) =>
          file.type.startsWith("image/")
            ? receiptFileToPdf(file, {
                date: r.expense_date,
                category: r.category,
                ...(r.supplier ? { supplier: r.supplier } : {}),
              })
            : file
        }
        onUploaded={async (path) => {
          await onAttach(path);
        }}
        showSuccessToast={false}
      />
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
