import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { saveFile } from "@/lib/download";

import { useIsAdmin } from "@/lib/subscriptions";

import { permanentFileUrl, uploadUserFile } from "@/lib/storage";

import {
  detectKind,
  mapCustomer,
  mapDocument,
  mapExpense,
  parseCsv,
  readTextAuto,
  toObjects,
} from "@/lib/import-lexware";
import { downloadCsv } from "./shared";

export function useEinstellungenState() {
  const queryClient = useQueryClient();
  const { data: isAdmin } = useIsAdmin();
  const [form, setForm] = useState<Record<string, string>>({});
  const signatureImageInput = useRef<HTMLInputElement>(null);

  /** Fügt ein Bild-Tag an die HTML-Signatur an. */
  function appendSignatureImage(url: string) {
    setForm((prev) => ({
      ...prev,
      email_signature_html:
        (prev["email_signature_html"] ?? "") +
        `\n<img src="${url}" alt="Bild" style="max-height:70px" />`,
    }));
  }

  /** Lädt eine Bilddatei hoch und fügt sie in die HTML-Signatur ein. */
  async function insertSignatureImage(file: File) {
    try {
      const path = await uploadUserFile(file, "signatur");
      appendSignatureImage(await permanentFileUrl(path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bild konnte nicht eingefügt werden");
    }
  }

  const [preview, setPreview] = useState<{
    kind: "documents" | "expenses" | "customers";
    fileName: string;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
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
      calc_worker_hourly_wage: String(d["calc_worker_hourly_wage"] ?? "15"),
      calc_labor_burden_percent: String(d["calc_labor_burden_percent"] ?? "32"),
      calc_material_cost_hour: String(d["calc_material_cost_hour"] ?? "1.20"),
      calc_overhead_cost_hour: String(d["calc_overhead_cost_hour"] ?? "3.50"),
      calc_profit_markup_percent: String(d["calc_profit_markup_percent"] ?? "20"),
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
          calc_worker_hourly_wage: Number(
            String(form["calc_worker_hourly_wage"] || "0").replace(",", "."),
          ),
          calc_labor_burden_percent: Number(
            String(form["calc_labor_burden_percent"] || "0").replace(",", "."),
          ),
          calc_material_cost_hour: Number(
            String(form["calc_material_cost_hour"] || "0").replace(",", "."),
          ),
          calc_overhead_cost_hour: Number(
            String(form["calc_overhead_cost_hour"] || "0").replace(",", "."),
          ),
          calc_profit_markup_percent: Number(
            String(form["calc_profit_markup_percent"] || "0").replace(",", "."),
          ),
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
    if (error) {
      toast.error(error.message);
      return;
    }
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
          (d as Record<string, unknown>)["tax_mode"] === "domestic"
            ? "19% Inland"
            : "Reverse-Charge",
        Status: d.status,
      })),
      { from, to },
    );
  }

  async function exportExpenses() {
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date");
    if (error) {
      toast.error(error.message);
      return;
    }
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
      { from, to },
    );
  }

  /** Holt alle eigenen Kunden, Belege und Positionen (RLS-geschützt) für das Backup. */
  async function loadBackupData() {
    const [customers, documents, items] = await Promise.all([
      supabase.from("customers").select("*").order("created_at"),
      supabase.from("documents").select("*").order("issue_date"),
      supabase.from("document_items").select("*").order("position"),
    ]);
    const err = customers.error ?? documents.error ?? items.error;
    if (err) throw new Error(err.message);
    return {
      customers: customers.data ?? [],
      documents: documents.data ?? [],
      document_items: items.data ?? [],
    };
  }

  async function exportBackupJson() {
    setBackupBusy(true);
    try {
      const data = await loadBackupData();
      const payload = {
        app: "GebCalc",
        exported_at: new Date().toISOString(),
        counts: {
          customers: data.customers.length,
          documents: data.documents.length,
          document_items: data.document_items.length,
        },
        ...data,
      };
      await saveFile(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        `GebCalc_Backup_${new Date().toISOString().slice(0, 10)}.json`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup fehlgeschlagen");
    } finally {
      setBackupBusy(false);
    }
  }

  async function exportBackupXlsx() {
    setBackupBusy(true);
    try {
      const data = await loadBackupData();
      const { buildXlsx } = await import("@/lib/xlsx");
      const blob = await buildXlsx([
        { name: "Kunden", rows: data.customers as Record<string, unknown>[] },
        { name: "Belege", rows: data.documents as Record<string, unknown>[] },
        { name: "Positionen", rows: data.document_items as Record<string, unknown>[] },
      ]);
      await saveFile(blob, `GebCalc_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup fehlgeschlagen");
    } finally {
      setBackupBusy(false);
    }
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
      const mapper =
        kind === "customers" ? mapCustomer : kind === "expenses" ? mapExpense : mapDocument;
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
        preview.kind === "customers"
          ? "customers"
          : preview.kind === "expenses"
            ? "expenses"
            : "documents";
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

  const costNumber = (key: string, fallback = 0) => {
    const value = Number(String(form[key] ?? fallback).replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const settingsWage = costNumber("calc_worker_hourly_wage", 15);
  const settingsBurdenPercent = Math.min(200, costNumber("calc_labor_burden_percent", 32));
  const settingsBurdenPerHour = (settingsWage * settingsBurdenPercent) / 100;
  const settingsSelfCost =
    settingsWage +
    settingsBurdenPerHour +
    costNumber("calc_material_cost_hour", 1.2) +
    costNumber("calc_overhead_cost_hour", 3.5);
  const settingsProfitPercent = Math.min(100, costNumber("calc_profit_markup_percent", 20));
  const settingsTargetRate = settingsSelfCost * (1 + settingsProfitPercent / 100);

  return {
    ready: true as const,
    KIND_LABEL,
    appendSignatureImage,
    backupBusy,
    exportBackupJson,
    exportBackupXlsx,
    exportDocuments,
    exportExpenses,
    form,
    from,
    importFile,
    insertSignatureImage,
    isAdmin,
    preview,
    previewOpen,
    save,
    savePreview,
    saving,
    setForm,
    setFrom,
    setPreview,
    setPreviewOpen,
    setTo,
    settingsBurdenPerHour,
    settingsSelfCost,
    settingsTargetRate,
    signatureImageInput,
    to,
  };
}
export type EinstellungenState = Extract<ReturnType<typeof useEinstellungenState>, { ready: true }>;
