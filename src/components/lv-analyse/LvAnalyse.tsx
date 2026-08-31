import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Loader2,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Download,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, formatNumber, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { analyseLvDocument, analyseLvScan } from '@/lib/lv-analyse.functions';
import { analyseLvFile } from '@/lib/lv-analyse/pipeline';
import { validateItems, issuesByItem } from '@/lib/lv-analyse/validate';
import {
  aggregateByCategory,
  recommendPrice,
  summarizeArea,
  summarizeCost,
  summarizeHours,
  DEFAULT_PRICE_INPUTS,
  type PriceInputs,
} from '@/lib/lv-analyse/aggregate';
import {
  CATEGORY_LABELS,
  DOCUMENT_KIND_LABELS,
  type LvAnalysisResult,
  type LvImportLogEntry,
  type LvItemCategory,
  type LvNormalizedItem,
  type LvProcessStep,
} from '@/lib/lv-analyse/types';
import { parseFrequency } from '@/lib/lv-analyse/normalize';
import {
  buildCsv,
  buildPdfReport,
  buildXlsx,
  canExport,
  downloadBlob,
  exportBaseName,
  needsReview,
  reviewFields,
  selectExportItems,
  REVIEW_LABEL,
} from '@/lib/lv-analyse/export';

/** Zweisprachige Beschriftung: Deutsch (Fachsprache der Ausschreibung) + Arabisch. */
function Bi({ de, ar }: { de: string; ar: string }) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{de}</span>
      <span className="text-[10px] text-muted-foreground" dir="rtl">
        {ar}
      </span>
    </span>
  );
}

const STATUS_STYLE: Record<LvAnalysisResult['status'], { label: string; ar: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  success: { label: 'Erfolgreich verarbeitet', ar: 'تمت المعالجة بنجاح', variant: 'default' },
  partial: { label: 'Teilweise verarbeitet', ar: 'معالجة جزئية', variant: 'secondary' },
  empty: { label: 'Keine Positionen gefunden', ar: 'لا توجد بنود', variant: 'outline' },
  error: { label: 'Fehler', ar: 'خطأ', variant: 'destructive' },
};

function StepIcon({ state }: { state: LvProcessStep['state'] }) {
  if (state === 'ok') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (state === 'warn') return <AlertTriangle className="size-4 text-amber-600" />;
  if (state === 'error') return <XCircle className="size-4 text-destructive" />;
  return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
}

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as LvItemCategory[];

export default function LvAnalyse() {
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
      .from('lv_import_logs')
      .select('id, file_name, created_at, document_kind, item_count, status, status_message')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    setLog(
      (data ?? []).map((row) => ({
        id: row.id as string,
        file_name: (row.file_name as string) ?? '',
        uploaded_at: (row.created_at as string) ?? '',
        document_kind: (row.document_kind as LvImportLogEntry['document_kind']) ?? 'unsupported',
        item_count: (row.item_count as number) ?? 0,
        status: (row.status as LvImportLogEntry['status']) ?? 'empty',
        status_message: (row.status_message as string) ?? '',
      })),
    );
  }, []);

  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  const handleUpload = async (file: File) => {
    setBusy(true);
    setSteps([{ state: 'running', label: `„${file.name}" wird verarbeitet …` }]);
    setResult(null);
    setItems([]);
    const toastId = toast.loading('Ausschreibung wird analysiert …');
    try {
      const analysis = await analyseLvFile(file, {
        analyseText: (args) => runText(args),
        analyseScan: (args) => runScan(args),
        onStep: (step) => setSteps((prev) => [...prev.filter((s) => s.state !== 'running'), step]),
      });
      setResult(analysis);
      setItems(analysis.items);
      setSteps(analysis.steps);

      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from('lv_import_logs').insert({
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
        void loadLog();
      }

      const style = STATUS_STYLE[analysis.status];
      const notify =
        analysis.status === 'success' ? toast.success : analysis.status === 'error' ? toast.error : toast.warning;
      notify(style.label, {
        id: toastId,
        description: `${analysis.statusMessage} ${analysis.recommendedAction}`,
        duration: 8000,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setSteps((prev) => [...prev.filter((s) => s.state !== 'running'), { state: 'error', label: reason }]);
      toast.error('Analyse fehlgeschlagen', { id: toastId, description: reason, duration: 8000 });
    } finally {
      setBusy(false);
    }
  };

  const issues = useMemo(() => validateItems(items), [items]);
  const issueMap = useMemo(() => issuesByItem(issues), [issues]);
  const categories = useMemo(() => aggregateByCategory(items), [items]);
  const area = useMemo(() => summarizeArea(items), [items]);
  const hours = useMemo(() => summarizeHours(items, priceInputs.performanceRate), [items, priceInputs.performanceRate]);
  const cost = useMemo(() => summarizeCost(items, result?.totals ?? []), [items, result]);
  const price = useMemo(() => recommendPrice(items, priceInputs), [items, priceInputs]);

  const update = (id: string, patch: Partial<LvNormalizedItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${prev.length}`,
        item_number: String(prev.length + 1),
        description: '',
        category: 'unterhaltsreinigung',
        quantity: null,
        unit: '',
        frequency: { label: '', perYear: null },
        area_m2: null,
        working_hours: null,
        unit_price: null,
        total_price: null,
        vat_rate: 19,
        source_page: null,
        confidence_score: 1,
        source_method: 'manuell',
        approved: true,
      },
    ]);

  const approveAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, approved: true })));
    toast.success('Alle Positionen freigegeben', { description: 'تمت الموافقة على جميع البنود.' });
  };

  const approvedCount = items.filter((i) => i.approved).length;
  const reviewCount = items.filter((i) => needsReview(i)).length;
  const exportReady = canExport(result, items);
  const exportItems = selectExportItems(items);
  const exportDisabled = !exportReady || exportItems.length === 0 || exporting;
  const exportHint = !result
    ? 'Bitte zuerst eine Ausschreibung analysieren.'
    : !exportReady
      ? 'Export ist erst nach abgeschlossener oder teilweise abgeschlossener Analyse möglich.'
      : exportItems.length === 0
        ? 'Bitte zuerst Positionen prüfen und freigeben – exportiert werden nur freigegebene Positionen.'
        : `${exportItems.length} freigegebene Positionen werden exportiert.`;

  const runExport = async (kind: 'csv' | 'xlsx' | 'pdf') => {
    if (!result) return;
    if (!exportReady) {
      toast.error('Export nicht möglich', {
        description: 'Die Analyse ist noch nicht abgeschlossen. Bitte laden Sie zuerst ein auswertbares Dokument hoch.',
      });
      return;
    }
    if (exportItems.length === 0) {
      toast.error('Keine freigegebenen Positionen', {
        description: 'Bitte prüfen Sie die Positionen im Reiter „Positionen“ und geben Sie sie frei (Schaltfläche „Alle freigeben“).',
      });
      return;
    }
    setExporting(true);
    try {
      const base = exportBaseName(result);
      if (kind === 'csv') {
        downloadBlob(new Blob([buildCsv(exportItems, result)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
      } else if (kind === 'xlsx') {
        downloadBlob(await buildXlsx(exportItems, result), `${base}.xlsx`);
      } else {
        const blob = await buildPdfReport(result, exportItems, {
          totalArea: area.totalArea,
          totalHours: hours.totalHours,
          totalCost: cost.net,
        });
        downloadBlob(blob, `${base}.pdf`);
      }
      toast.success('Export erstellt', {
        description: `${exportItems.length} freigegebene Positionen als ${kind.toUpperCase()} heruntergeladen.`,
      });
    } catch (error) {
      toast.error('Export fehlgeschlagen', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="size-4" />
            <Bi de="Ausschreibung hochladen" ar="رفع كراسة الشروط" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xlsm,.csv,.txt,.x81,.x82,.x83,.x84,.x85,.x86,.d81,.d83,.d84,.p83,.gaeb,.xml"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleUpload(file);
                }}
              />
              <Button asChild disabled={busy}>
                <span className="cursor-pointer">
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                  Datei auswählen (PDF, XLSX, CSV, GAEB)
                </span>
              </Button>
            </label>
            <span className="text-xs text-muted-foreground" dir="rtl">
              الصيغ المدعومة: PDF، Excel، CSV، GAEB
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
            <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => void runExport('xlsx')}>
              <FileSpreadsheet className="mr-1 size-4" /> XLSX-Export
            </Button>
            <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => void runExport('csv')}>
              <Download className="mr-1 size-4" /> CSV-Export
            </Button>
            <Button variant="outline" size="sm" disabled={exportDisabled} onClick={() => void runExport('pdf')}>
              <FileText className="mr-1 size-4" /> PDF-Bericht
            </Button>
            {exporting && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{exportHint}</span>
          </div>

          {/* Verarbeitungsstatus – immer sichtbar, nie leer */}
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Verarbeitungsstatus / حالة المعالجة
            </p>
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Datei verarbeitet. Laden Sie ein Leistungsverzeichnis, Preisblatt oder eine
                Leistungsbeschreibung hoch.
              </p>
            ) : (
              <ul className="space-y-1">
                {steps.map((step, index) => (
                  <li key={`${step.label}-${index}`} className="flex items-start gap-2 text-sm">
                    <StepIcon state={step.state} />
                    <span>{step.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {result && (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs uppercase text-muted-foreground">Erkannter Dokumenttyp / نوع المستند</p>
                <p className="font-medium">{DOCUMENT_KIND_LABELS[result.kind].de}</p>
                <p className="text-xs text-muted-foreground" dir="rtl">
                  {DOCUMENT_KIND_LABELS[result.kind].ar}
                </p>
                <p className="text-xs text-muted-foreground">{result.kindReason}</p>
              </div>
              <div className="space-y-1">
                <Badge variant={STATUS_STYLE[result.status].variant}>{STATUS_STYLE[result.status].label}</Badge>
                <p className="text-sm">{result.statusMessage}</p>
                <p className="text-xs text-muted-foreground">
                  <strong>Empfohlene Maßnahme:</strong> {result.recommendedAction}
                </p>
                {result.rawText && (
                  <Button variant="ghost" size="sm" onClick={() => setShowText((v) => !v)}>
                    {showText ? 'Textvorschau ausblenden' : 'Textvorschau anzeigen'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {showText && result?.rawText && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">
              {result.rawText.slice(0, 20000)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Auswertung */}
      <Tabs defaultValue="items">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="items">Positionen · البنود</TabsTrigger>
          <TabsTrigger value="area">Flächen · المساحات</TabsTrigger>
          <TabsTrigger value="hours">Arbeitsstunden · ساعات العمل</TabsTrigger>
          <TabsTrigger value="cost">Kostenanalyse · التكاليف</TabsTrigger>
          <TabsTrigger value="price">Preisempfehlung · التسعير</TabsTrigger>
          <TabsTrigger value="missing">Fehlende Daten · نواقص</TabsTrigger>
          <TabsTrigger value="log">Import-Protokoll · السجل</TabsTrigger>
        </TabsList>

        {/* 1) Positionen prüfen & freigeben */}
        <TabsContent value="items" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {items.length} Positionen · {approvedCount} freigegeben · {issues.length} Hinweise ·{' '}
              <span className={reviewCount ? 'font-medium text-amber-700' : undefined}>
                {reviewCount} × {REVIEW_LABEL}
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 size-4" /> Position hinzufügen
              </Button>
              <Button size="sm" onClick={approveAll} disabled={items.length === 0}>
                <CheckCircle2 className="mr-1 size-4" /> Alle freigeben
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyHint result={result} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Pos.</TableHead>
                    <TableHead className="min-w-56">Beschreibung</TableHead>
                    <TableHead className="w-40">Kategorie</TableHead>
                    <TableHead className="w-20 text-right">Menge</TableHead>
                    <TableHead className="w-20">Einheit</TableHead>
                    <TableHead className="w-32">Intervall</TableHead>
                    <TableHead className="w-24 text-right">m²</TableHead>
                    <TableHead className="w-20 text-right">Std.</TableHead>
                    <TableHead className="w-24 text-right">EP €</TableHead>
                    <TableHead className="w-24 text-right">GP €</TableHead>
                    <TableHead className="w-16 text-right">MwSt</TableHead>
                    <TableHead className="w-16 text-right">Seite</TableHead>
                    <TableHead className="w-20 text-right">Sicherh.</TableHead>
                    <TableHead className="w-24">Freigabe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const itemIssues = issueMap.get(item.id) ?? [];
                    const hasError = itemIssues.some((i) => i.level === 'error');
                    const review = reviewFields(item);
                    return (
                      <TableRow key={item.id} className={hasError ? 'bg-destructive/5' : undefined}>
                        <TableCell>
                          <Input
                            className="h-7 text-xs"
                            value={item.item_number}
                            onChange={(e) => update(item.id, { item_number: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7 text-xs"
                            value={item.description}
                            onChange={(e) => update(item.id, { description: e.target.value })}
                          />
                          {review.length > 0 && (
                            <p className="mt-0.5 text-[10px] text-amber-700">
                              {REVIEW_LABEL}: {review.join(', ')}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-7 w-full rounded-md border bg-background px-1 text-xs"
                            value={item.category}
                            onChange={(e) => update(item.id, { category: e.target.value as LvItemCategory })}
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c} value={c}>
                                {CATEGORY_LABELS[c].de}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <NumCell
                            value={item.quantity}
                            onChange={(v) =>
                              update(item.id, {
                                quantity: v,
                                total_price: v !== null && item.unit_price !== null ? round2(v * item.unit_price) : item.total_price,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7 text-xs"
                            value={item.unit}
                            onChange={(e) => update(item.id, { unit: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7 text-xs"
                            value={item.frequency.label}
                            placeholder="z. B. 5x wöchentlich"
                            onChange={(e) =>
                              update(item.id, {
                                frequency: { ...parseFrequency(e.target.value), label: e.target.value },
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <NumCell value={item.area_m2} onChange={(v) => update(item.id, { area_m2: v })} />
                        </TableCell>
                        <TableCell>
                          <NumCell value={item.working_hours} onChange={(v) => update(item.id, { working_hours: v })} />
                        </TableCell>
                        <TableCell>
                          <NumCell
                            value={item.unit_price}
                            onChange={(v) =>
                              update(item.id, {
                                unit_price: v,
                                total_price: v !== null && item.quantity !== null ? round2(v * item.quantity) : item.total_price,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <NumCell value={item.total_price} onChange={(v) => update(item.id, { total_price: v })} />
                        </TableCell>
                        <TableCell>
                          <NumCell value={item.vat_rate} onChange={(v) => update(item.id, { vat_rate: v })} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.source_page ?? (
                            <span className="text-[10px] text-amber-700">{REVIEW_LABEL}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant={item.confidence_score >= 0.7 ? 'secondary' : 'outline'}>
                            {Math.round(item.confidence_score * 100)} %
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant={item.approved ? 'default' : 'outline'}
                              className="h-7 px-2"
                              onClick={() => update(item.id, { approved: !item.approved })}
                            >
                              <CheckCircle2 className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                            >
                              <Trash2 className="size-3 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* 2) Flächen */}
        <TabsContent value="area" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Gesamtfläche" ar="إجمالي المساحة" value={`${formatNumber(area.totalArea)} m²`} />
            <Kpi label="Jahresfläche" ar="المساحة السنوية" value={`${formatNumber(area.annualArea)} m²`} />
            <Kpi label="Positionen mit Fläche" ar="بنود بمساحة" value={String(area.itemsWithArea)} />
            <Kpi label="Ohne Flächenangabe" ar="بدون مساحة" value={String(area.itemsWithoutArea)} />
          </div>
          <CategoryTable rows={categories} column="area_m2" />
        </TabsContent>

        {/* 3) Arbeitsstunden */}
        <TabsContent value="hours" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Stunden je Einsatz" ar="ساعات لكل زيارة" value={formatNumber(hours.totalHours)} />
            <Kpi label="Jahresstunden" ar="ساعات سنوية" value={formatNumber(hours.annualHours)} />
            <Kpi label="Monatsstunden" ar="ساعات شهرية" value={formatNumber(hours.monthlyHours)} />
            <Kpi
              label={`Geschätzt aus Fläche (${formatNumber(hours.performanceRate)} m²/Std.)`}
              ar="تقدير من المساحة"
              value={formatNumber(hours.estimatedFromArea)}
            />
          </div>
          <CategoryTable rows={categories} column="hours" />
        </TabsContent>

        {/* 4) Kostenanalyse */}
        <TabsContent value="cost" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Netto (Positionen)" ar="الصافي" value={formatMoney(cost.net)} />
            <Kpi label={`MwSt ${formatNumber(cost.vatRate)} %`} ar="ضريبة" value={formatMoney(cost.vat)} />
            <Kpi label="Brutto" ar="الإجمالي" value={formatMoney(cost.gross)} />
            <Kpi label="Jahresnetto" ar="صافي سنوي" value={formatMoney(cost.annualNet)} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Summen aus dem Dokument (Preisblatt) · المبالغ الواردة في المستند
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cost.documentTotals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Im Dokument wurden keine separaten Summenzeilen gefunden.
                </p>
              ) : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead className="w-24 text-right">Seite</TableHead>
                      <TableHead className="w-40 text-right">Betrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cost.documentTotals.map((t, i) => (
                      <TableRow key={`${t.label}-${i}`}>
                        <TableCell>{t.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.source_page ?? '–'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <CategoryTable rows={categories} column="total" />
        </TabsContent>

        {/* 5) Preisempfehlung */}
        <TabsContent value="price" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Kalkulationsparameter · معايير التسعير</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <LabeledNumber
                label="Stundensatz €"
                value={priceInputs.hourlyRate}
                onChange={(v) => setPriceInputs((p) => ({ ...p, hourlyRate: v }))}
              />
              <LabeledNumber
                label="Gemeinkosten %"
                value={priceInputs.overheadPercent}
                onChange={(v) => setPriceInputs((p) => ({ ...p, overheadPercent: v }))}
              />
              <LabeledNumber
                label="Gewinn %"
                value={priceInputs.profitPercent}
                onChange={(v) => setPriceInputs((p) => ({ ...p, profitPercent: v }))}
              />
              <LabeledNumber
                label="Leistungswert m²/Std."
                value={priceInputs.performanceRate}
                onChange={(v) => setPriceInputs((p) => ({ ...p, performanceRate: v || 1 }))}
              />
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Kalkulierte Jahresstunden" ar="ساعات سنوية محسوبة" value={formatNumber(price.annualHours)} />
            <Kpi label="Empfehlung Jahr netto" ar="السعر السنوي المقترح" value={formatMoney(price.recommendedAnnualNet)} />
            <Kpi label="Empfehlung Monat netto" ar="السعر الشهري المقترح" value={formatMoney(price.recommendedMonthlyNet)} />
            <Kpi label="Preis je m²" ar="سعر المتر" value={formatMoney(price.recommendedPerSqm)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {price.deltaPercent === null
              ? 'Im Dokument sind keine Preise hinterlegt – die Empfehlung basiert vollständig auf der eigenen Kalkulation.'
              : `Die im Dokument enthaltenen Preise liegen ${formatNumber(price.deltaPercent)} % ${
                  price.deltaPercent >= 0 ? 'über' : 'unter'
                } der eigenen Kalkulation (${formatMoney(price.documentAnnualNet)} pro Jahr).`}
          </p>
        </TabsContent>

        {/* 6) Fehlende Daten */}
        <TabsContent value="missing" className="space-y-3">
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine fehlenden Pflichtangaben. · لا توجد بيانات ناقصة.
            </p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Ebene</TableHead>
                  <TableHead className="w-32">Feld</TableHead>
                  <TableHead>Hinweis</TableHead>
                  <TableHead>Empfohlene Maßnahme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue, index) => (
                  <TableRow key={`${issue.itemId}-${issue.field}-${index}`}>
                    <TableCell>
                      <Badge variant={issue.level === 'error' ? 'destructive' : 'secondary'}>
                        {issue.level === 'error' ? 'Pflicht' : 'Hinweis'}
                      </Badge>
                    </TableCell>
                    <TableCell>{issue.field}</TableCell>
                    <TableCell>{issue.message}</TableCell>
                    <TableCell className="text-muted-foreground">{issue.hint}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* 7) Import-Protokoll */}
        <TabsContent value="log" className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => void loadLog()}>
            <RefreshCw className="mr-1 size-4" /> Aktualisieren
          </Button>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Importe protokolliert.</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Dateiname</TableHead>
                  <TableHead className="w-32">Hochgeladen</TableHead>
                  <TableHead className="w-56">Erkannter Typ</TableHead>
                  <TableHead className="w-24 text-right">Positionen</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.file_name}</TableCell>
                    <TableCell>{formatDate(entry.uploaded_at)}</TableCell>
                    <TableCell>{DOCUMENT_KIND_LABELS[entry.document_kind]?.de ?? entry.document_kind}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.item_count}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_STYLE[entry.status]?.variant ?? 'outline'}>
                        {STATUS_STYLE[entry.status]?.label ?? entry.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function EmptyHint({ result }: { result: LvAnalysisResult | null }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {result ? (
        <>
          <p className="font-medium text-foreground">{result.statusMessage}</p>
          <p className="mt-1">{result.recommendedAction}</p>
          {result.kind === 'pricing_form' && (
            <p className="mt-1">Die erkannten Beträge stehen im Reiter „Kostenanalyse“.</p>
          )}
        </>
      ) : (
        <p>Noch keine Datei analysiert. · لم يتم تحليل أي ملف بعد.</p>
      )}
    </div>
  );
}

function Kpi({ label, ar, value }: { label: string; ar: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground" dir="rtl">
          {ar}
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function CategoryTable({
  rows,
  column,
}: {
  rows: { category: LvItemCategory; items: number; area_m2: number; hours: number; total: number }[];
  column: 'area_m2' | 'hours' | 'total';
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Daten vorhanden.</p>;
  }
  const header = column === 'area_m2' ? 'Fläche m²' : column === 'hours' ? 'Stunden' : 'Betrag €';
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Kategorie</TableHead>
          <TableHead className="w-24 text-right">Positionen</TableHead>
          <TableHead className="w-40 text-right">{header}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.category}>
            <TableCell>
              <Bi de={CATEGORY_LABELS[row.category].de} ar={CATEGORY_LABELS[row.category].ar} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.items}</TableCell>
            <TableCell className="text-right tabular-nums">
              {column === 'total' ? formatMoney(row.total) : formatNumber(row[column])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NumCell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Input
      className={`h-7 text-right text-xs tabular-nums ${value === null ? 'border-amber-500' : ''}`}
      value={value === null ? '' : String(value).replace('.', ',')}
      placeholder="–"
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return onChange(null);
        const n = Number(raw.replace(/\./g, '').replace(',', '.'));
        onChange(Number.isFinite(n) ? n : null);
      }}
    />
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="tabular-nums"
        value={String(value).replace('.', ',')}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </label>
  );
}
