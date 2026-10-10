import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { today } from "@/lib/format";

import { receiptFileToPdf } from "@/lib/receipt-pdf";
import { fetchStoredBlob, uploadUserFile } from "@/lib/storage";

import { scanReceipt } from "@/lib/receipt-scan.functions";
import { receiptFormValues } from "@/lib/receipt-form";
import { findDuplicateExpense } from "@/lib/expense-duplicate";
import { buildExpenseReceiptZip } from "@/lib/expense-receipt-export";
import { saveFile } from "@/lib/download";
import { readIncomingEInvoice, type IncomingEInvoice } from "@/lib/e-invoice-import";

import { CATEGORIES, type Form, empty, fileToDataUrl, type ExpenseRowData } from "./shared";

export function useAusgabenState() {
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
      const { error } = await supabase.from("expenses").update({ receipt_url: path }).eq("id", id);
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
      return {
        periodFrom: customFrom,
        periodTo: customTo,
        periodLabel: `${customFrom}_${customTo}`,
      };
    }
    if (periodMode === "year") {
      return {
        periodFrom: `${filterYear}-01-01`,
        periodTo: `${filterYear}-12-31`,
        periodLabel: `Jahr_${filterYear}`,
      };
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
    const duplicate = findDuplicateExpense(form, rows as unknown as ExpenseRowData[]);
    if (duplicate) {
      setDuplicateExpense(duplicate);
      return;
    }
    add.mutate();
  }

  const totalNet = filteredRows.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalGross = filteredRows.reduce((s, r) => s + Number(r.gross_amount), 0);
  const totalVat = filteredRows.reduce((s, r) => s + Number(r.vat_amount), 0);

  return {
    ready: true as const,
    add,
    analyze,
    attachReceipt,
    customFrom,
    customTo,
    duplicateExpense,
    eInvoice,
    exportRows,
    filterYear,
    filteredRows,
    form,
    handleEInvoice,
    handleReceipt,
    importing,
    periodFrom,
    periodMode,
    periodTo,
    preview,
    processingReceipt,
    projects,
    receiptExport,
    receiptToRetry,
    remove,
    saveWithDuplicateCheck,
    scanError,
    scanned,
    scanning,
    selectedQuarter,
    setCustomFrom,
    setCustomTo,
    setDuplicateExpense,
    setFilterYear,
    setForm,
    setPeriodMode,
    setPreview,
    setProcessingReceipt,
    setSelectedQuarter,
    totalGross,
    totalNet,
    totalVat,
  };
}
export type AusgabenState = Extract<ReturnType<typeof useAusgabenState>, { ready: true }>;
