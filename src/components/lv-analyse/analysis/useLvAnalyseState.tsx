import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

import { analyseLvDocument, analyseLvScan } from "@/lib/lv-analyse.functions";
import { analyseLvFile } from "@/lib/lv-analyse/pipeline";
import { validateItems, issuesByItem } from "@/lib/lv-analyse/validate";
import {
  aggregateByCategory,
  recommendPrice,
  summarizeArea,
  summarizeCost,
  summarizeHours,
  DEFAULT_PRICE_INPUTS,
  type PriceInputs,
} from "@/lib/lv-analyse/aggregate";
import {
  type LvAnalysisResult,
  type LvImportLogEntry,
  type LvNormalizedItem,
  type LvProcessStep,
} from "@/lib/lv-analyse/types";

import {
  NO_OWN_PRICE_HINT,
  emptyCalculation,
  hasOwnPrice,
  summarizeOwnCalculation,
} from "@/lib/lv-analyse/calculation";

import {
  buildCsv,
  buildPdfReport,
  buildXlsx,
  canExport,
  downloadBlob,
  exportBaseName,
  needsReview,
  selectExportItems,
} from "@/lib/lv-analyse/export";
import { STATUS_STYLE } from "./shared";

export function useLvAnalyseState() {
  const runText = useServerFn(analyseLvDocument);
  const runScan = useServerFn(analyseLvScan);

  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<LvProcessStep[]>([]);
  const [result, setResult] = useState<LvAnalysisResult | null>(null);
  const [items, setItems] = useState<LvNormalizedItem[]>([]);
  const [log, setLog] = useState<LvImportLogEntry[]>([]);
  const [priceInputs, setPriceInputs] = useState<PriceInputs>(DEFAULT_PRICE_INPUTS);
  const [showText, setShowText] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadLog = useCallback(async () => {
    const { data, error } = await supabase
      .from("lv_import_logs")
      .select("id, file_name, created_at, document_kind, item_count, status, status_message")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Import-Protokoll konnte nicht geladen werden", {
        description: error.message,
      });
      return;
    }
    setLog(
      (data ?? []).map((row) => ({
        id: row.id as string,
        file_name: (row.file_name as string) ?? "",
        uploaded_at: (row.created_at as string) ?? "",
        document_kind: (row.document_kind as LvImportLogEntry["document_kind"]) ?? "unsupported",
        item_count: (row.item_count as number) ?? 0,
        status: (row.status as LvImportLogEntry["status"]) ?? "empty",
        status_message: (row.status_message as string) ?? "",
      })),
    );
  }, []);

  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  const [deletingLog, setDeletingLog] = useState(false);

  const deleteLogEntry = async (id: string) => {
    setDeletingLog(true);
    const { error } = await supabase.from("lv_import_logs").delete().eq("id", id);
    setDeletingLog(false);
    if (error) {
      toast.error("Protokolleintrag konnte nicht gelöscht werden", { description: error.message });
      return;
    }
    toast.success("Protokolleintrag gelöscht");
    void loadLog();
  };

  const deleteAllLogEntries = async () => {
    setDeletingLog(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setDeletingLog(false);
      toast.error("Nicht angemeldet");
      return;
    }
    const { error } = await supabase.from("lv_import_logs").delete().eq("user_id", auth.user.id);
    setDeletingLog(false);
    if (error) {
      toast.error("Einträge konnten nicht gelöscht werden", { description: error.message });
      return;
    }
    toast.success("Alle Protokolleinträge gelöscht");
    void loadLog();
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    setSteps([{ state: "running", label: `„${file.name}" wird verarbeitet …` }]);
    setResult(null);
    setItems([]);
    setPriceInputs(DEFAULT_PRICE_INPUTS);
    const toastId = toast.loading("Ausschreibung wird analysiert …");
    try {
      const analysis = await analyseLvFile(file, {
        analyseText: (args) => runText(args),
        analyseScan: (args) => runScan(args),
        onStep: (step) => setSteps((prev) => [...prev.filter((s) => s.state !== "running"), step]),
      });
      setResult(analysis);
      setItems(analysis.items);
      setSteps(analysis.steps);

      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { error: logError } = await supabase.from("lv_import_logs").insert({
          user_id: auth.user.id,
          file_name: analysis.fileName,
          file_size: analysis.fileSize,
          document_kind: analysis.kind,
          item_count: analysis.items.length,
          total_count: analysis.totals.length,
          status: analysis.status,
          status_message: analysis.statusMessage,
          page_count: analysis.pageCount,
        });
        if (logError) {
          toast.warning("Import-Protokoll nicht gespeichert", {
            description: `${logError.message} Die Analyse selbst ist davon nicht betroffen.`,
          });
        }
        void loadLog();
      }

      const style = STATUS_STYLE[analysis.status];
      const notify =
        analysis.status === "success"
          ? toast.success
          : analysis.status === "error"
            ? toast.error
            : toast.warning;
      notify(style.label, {
        id: toastId,
        description: `${analysis.statusMessage} ${analysis.recommendedAction}`,
        duration: 8000,
      });

      // Teilfehler der Verarbeitung (KI, OCR, GAEB) sichtbar machen.
      for (const failure of analysis.failures ?? []) {
        toast.warning("Hinweis zur Verarbeitung", { description: failure, duration: 10000 });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setSteps((prev) => [
        ...prev.filter((s) => s.state !== "running"),
        { state: "error", label: reason },
      ]);
      toast.error("Analyse fehlgeschlagen", { id: toastId, description: reason, duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  // Der Steuersatz kommt ausschließlich aus den Firmeneinstellungen –
  // niemals aus dem hochgeladenen Ausschreibungsdokument.
  const [companyVatRate, setCompanyVatRate] = useState(19);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("small_business")
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast.error("Firmeneinstellungen konnten nicht geladen werden", {
          description: `${error.message} Es wird vorläufig mit 19 % MwSt gerechnet.`,
        });
        return;
      }
      setCompanyVatRate(data?.small_business ? 0 : 19);
    })();
    return () => {
      active = false;
    };
  }, []);

  const issues = useMemo(() => validateItems(items), [items]);
  const issueMap = useMemo(() => issuesByItem(issues), [issues]);
  const categories = useMemo(() => aggregateByCategory(items), [items]);
  const area = useMemo(() => summarizeArea(items), [items]);
  const hours = useMemo(
    () => summarizeHours(items, priceInputs.performanceRate),
    [items, priceInputs.performanceRate],
  );
  const cost = useMemo(
    () => summarizeCost(items, result?.totals ?? [], companyVatRate),
    [items, result, companyVatRate],
  );
  const price = useMemo(() => recommendPrice(items, priceInputs), [items, priceInputs]);

  const update = (id: string, patch: Partial<LvNormalizedItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${prev.length}`,
        analysis_id: result?.analysisId ?? "",
        item_number: String(prev.length + 1),
        description: "",
        category: "unterhaltsreinigung",
        quantity: null,
        unit: "",
        frequency: { label: "", perYear: null },
        area_m2: null,
        working_hours: null,
        unit_price: null,
        total_price: null,
        vat_rate: 19,
        source_page: null,
        confidence_score: 1,
        source_method: "manuell",
        calculation: emptyCalculation(),
        approved: false,
      },
    ]);

  const approveAll = () => {
    const open = items.filter((i) => !hasOwnPrice(i)).length;
    setItems((prev) => prev.map((i) => (hasOwnPrice(i) ? { ...i, approved: true } : i)));
    if (open > 0) {
      toast.warning("Kalkulierte Positionen freigegeben", {
        description: `${open} Positionen ohne eigenen Einheitspreis bleiben offen. ${NO_OWN_PRICE_HINT}`,
      });
    } else {
      toast.success("Alle Positionen freigegeben");
    }
  };

  const approvedCount = items.filter((i) => i.approved).length;
  const reviewCount = items.filter((i) => needsReview(i)).length;
  const exportReady = canExport(result, items);
  const exportItems = selectExportItems(items, result?.analysisId ?? null);
  const ownSummary = useMemo(
    () => summarizeOwnCalculation(items, companyVatRate),
    [items, companyVatRate],
  );
  const exportDisabled = !exportReady || exportItems.length === 0 || exporting;
  const exportHint = !result
    ? "Bitte zuerst eine Ausschreibung analysieren."
    : !exportReady
      ? "Export ist erst nach abgeschlossener oder teilweise abgeschlossener Analyse möglich."
      : exportItems.length === 0
        ? "Bitte zuerst mindestens eine Position prüfen und freigeben. Exportiert werden nur freigegebene Positionen."
        : `${exportItems.length} freigegebene Positionen werden exportiert.`;

  const updateCalc = (item: LvNormalizedItem, patch: Partial<LvNormalizedItem["calculation"]>) =>
    update(item.id, { calculation: { ...item.calculation, ...patch } });

  const runExport = async (kind: "csv" | "xlsx" | "pdf") => {
    if (!result) return;
    if (!exportReady) {
      toast.error("Export nicht möglich", {
        description:
          "Die Analyse ist noch nicht abgeschlossen. Bitte laden Sie zuerst ein auswertbares Dokument hoch.",
      });
      return;
    }
    if (exportItems.length === 0) {
      toast.error("Keine freigegebenen Positionen", {
        description:
          "Bitte zuerst mindestens eine Position prüfen und freigeben. Exportiert werden nur freigegebene Positionen.",
      });
      return;
    }
    setExporting(true);
    try {
      const base = exportBaseName(result);
      if (kind === "csv") {
        downloadBlob(
          new Blob([buildCsv(exportItems, result, { vatRate: companyVatRate })], {
            type: "text/csv;charset=utf-8",
          }),
          `${base}.csv`,
        );
      } else if (kind === "xlsx") {
        downloadBlob(
          await buildXlsx(exportItems, result, { vatRate: companyVatRate }),
          `${base}.xlsx`,
        );
      } else {
        // Kopfzeile muss exakt die exportierten (freigegebenen) Positionen abbilden.
        const exportArea = summarizeArea(exportItems);
        const exportHours = summarizeHours(exportItems, priceInputs.performanceRate);
        const exportCost = summarizeCost(exportItems, result?.totals ?? [], companyVatRate);
        const blob = await buildPdfReport(result, exportItems, {
          totalArea: exportArea.totalArea,
          totalHours: exportHours.annualHoursTotal,
          totalCost: exportCost.net,
          vatRate: companyVatRate,
          itemsWithoutFrequency: exportCost.itemsWithoutFrequency,
        });

        downloadBlob(blob, `${base}.pdf`);
      }
      toast.success("Export erstellt", {
        description: `${exportItems.length} freigegebene Positionen als ${kind.toUpperCase()} heruntergeladen.`,
      });
    } catch (error) {
      toast.error("Export fehlgeschlagen", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExporting(false);
    }
  };

  return {
    ready: true as const,
    addItem,
    approveAll,
    area,
    busy,
    categories,
    cost,
    deleteAllLogEntries,
    deleteLogEntry,
    deletingLog,
    exportDisabled,
    exportHint,
    exporting,
    handleUpload,
    hours,
    issues,
    items,
    loadLog,
    log,
    ownSummary,
    price,
    priceInputs,
    result,
    runExport,
    setItems,
    setPriceInputs,
    setShowText,
    showText,
    steps,
    update,
  };
}
export type LvAnalyseState = Extract<ReturnType<typeof useLvAnalyseState>, { ready: true }>;
