import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

import { formatDate, formatMoney } from "@/lib/format";
import { FileUploadButton } from "@/components/FileUploadButton";
import { ReceiptScannerButton } from "@/components/ReceiptScannerButton";

import { readIncomingEInvoice } from "@/lib/e-invoice-import";
import { Eye, FileCode2, Loader2, Paperclip, Plus, Sparkles } from "lucide-react";
import { CATEGORIES } from "./shared";

import type { AusgabenState } from "./useAusgabenState";
export function AusgabenSection1({ state }: { state: AusgabenState }) {
  const {
    add,
    analyze,
    duplicateExpense,
    eInvoice,
    form,
    handleEInvoice,
    handleReceipt,
    importing,
    processingReceipt,
    projects,
    receiptToRetry,
    saveWithDuplicateCheck,
    scanError,
    scanned,
    scanning,
    setDuplicateExpense,
    setForm,
    setPreview,
    setProcessingReceipt,
  } = state;
  return (
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
  );
}
