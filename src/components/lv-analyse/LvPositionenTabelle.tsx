import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  CATEGORY_LABELS,
  type LvItemCategory,
  type LvNormalizedItem,
} from "@/lib/lv-analyse/types";
import { parseFrequency } from "@/lib/lv-analyse/normalize";
import {
  CALC_STATUS_LABELS,
  NO_OWN_PRICE_HINT,
  annualOfferPrice,
  calcStatus,
  hasOwnPrice,
  offerPrice,
  summarizeOwnCalculation,
} from "@/lib/lv-analyse/calculation";
import { REVIEW_LABEL, needsReview, reviewFields } from "@/lib/lv-analyse/export";

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as LvItemCategory[];
const EMPTY = "—";

/** Vollständige Spaltenreihenfolge – wird niemals dynamisch ausgeblendet. */
const COLUMNS = [
  "Pos.",
  "Beschreibung",
  "Kategorie",
  "Geforderte Menge",
  "Einheit",
  "Intervall",
  "Fläche (m²)",
  "Geforderte Arbeitsstunden",
  "Eigener Einheitspreis (€)",
  "Gesamtpreis (€)",
  "Jahrespreis (€)",
  "MwSt. (%)",
  "Seite",
  "Sicherheitswert",
  "Kalkulationsstatus",
  "Freigabe",
  "Aktionen",
] as const;

type Filter = "alle" | "offen" | "pruefung" | "freigegeben";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "offen", label: "Offen" },
  { key: "pruefung", label: "Prüfung erforderlich" },
  { key: "freigegeben", label: "Freigegeben" },
];

function ReviewMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-amber-700">
      <AlertTriangle className="size-3 shrink-0" /> {REVIEW_LABEL}
    </span>
  );
}

function Placeholder() {
  return <span className="text-muted-foreground">{EMPTY}</span>;
}

function NumCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const format = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  /** Lokaler Roh-Text: Zwischenzustände wie „12," dürfen nicht verloren gehen. */
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  // Nur synchronisieren, wenn das Feld nicht bearbeitet wird – sonst frisst
  // das Neurendern das eben getippte Komma.
  if (!focused && text !== format(value)) setText(format(value));

  return (
    <Input
      className="h-7 text-right text-xs tabular-nums"
      value={text}
      placeholder={EMPTY}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(format(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const trimmed = raw.trim();
        if (!trimmed) return onChange(null);
        const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

type Props = {
  items: LvNormalizedItem[];
  issueCount: number;
  exporting: boolean;
  exportHint: string;
  exportDisabled: boolean;
  onExport: (kind: "csv" | "xlsx" | "pdf") => void;
  onUpdate: (id: string, patch: Partial<LvNormalizedItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onApproveAll: () => void;
  emptyState: React.ReactNode;
};

/**
 * Vollständige Positionen-Tabelle: alle Spalten immer sichtbar, leere Felder mit „—",
 * Pflichtlücken mit Warnhinweis, responsive Kartenansicht auf Mobilgeräten.
 */
export function LvPositionenTabelle({
  items,
  issueCount,
  exporting,
  exportHint,
  exportDisabled,
  onExport,
  onUpdate,
  onRemove,
  onAdd,
  onApproveAll,
  emptyState,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const [detailId, setDetailId] = useState<string | null>(null);

  const approvedCount = items.filter((i) => i.approved).length;
  const warningCount = items.filter((i) => needsReview(i)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "freigegeben" && !item.approved) return false;
      if (filter === "offen" && (item.approved || hasOwnPrice(item))) return false;
      if (filter === "pruefung" && !needsReview(item)) return false;
      if (!q) return true;
      return [
        item.item_number,
        item.description,
        CATEGORY_LABELS[item.category].de,
        item.unit,
        item.frequency.label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, filter, query]);

  const approvedPriced = useMemo(() => items.filter((i) => i.approved && hasOwnPrice(i)), [items]);
  const summary = useMemo(() => summarizeOwnCalculation(approvedPriced), [approvedPriced]);

  const updateCalc = (item: LvNormalizedItem, patch: Partial<LvNormalizedItem["calculation"]>) =>
    onUpdate(item.id, { calculation: { ...item.calculation, ...patch } });

  const toggleApprove = (item: LvNormalizedItem) => {
    if (!item.approved && !hasOwnPrice(item)) {
      toast.error("Freigabe nicht möglich", { description: NO_OWN_PRICE_HINT });
      return;
    }
    onUpdate(item.id, { approved: !item.approved });
  };

  const detail = items.find((i) => i.id === detailId) ?? null;

  return (
    <div className="space-y-3">
      {/* Kopfbereich */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{items.length} Positionen extrahiert</span>
        <span className="text-sm text-muted-foreground">
          {approvedCount} Positionen freigegeben
        </span>
        <span
          className={`text-sm ${warningCount ? "font-medium text-amber-700" : "text-muted-foreground"}`}
        >
          {issueCount} Hinweise zur Prüfung
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1 size-4" /> Position hinzufügen
          </Button>
          <Button size="sm" onClick={onApproveAll} disabled={items.length === 0}>
            <CheckCircle2 className="mr-1 size-4" /> Alle Positionen freigeben
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Positionen durchsuchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              filter === f.key ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* Desktop & Tablet: vollständige Tabelle mit horizontalem Scrollen */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table className="min-w-[1800px] text-xs">
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap align-bottom">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => {
                  const total = offerPrice(item);
                  const annual = annualOfferPrice(item);
                  const review = reviewFields(item);
                  return (
                    <TableRow key={item.id} className="align-top">
                      <TableCell className="w-20">
                        <Input
                          className="h-7 text-xs"
                          value={item.item_number}
                          placeholder={EMPTY}
                          onChange={(e) => onUpdate(item.id, { item_number: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="min-w-[18rem] max-w-[24rem]">
                        <Textarea
                          className="min-h-[3.5rem] whitespace-pre-wrap break-words text-xs"
                          title={item.description}
                          value={item.description}
                          placeholder={EMPTY}
                          onChange={(e) => onUpdate(item.id, { description: e.target.value })}
                        />
                        <div className="flex items-center gap-2">
                          <ReviewMark show={review.length > 0} />
                          <button
                            type="button"
                            className="mt-0.5 text-[10px] underline underline-offset-2"
                            onClick={() => setDetailId(detailId === item.id ? null : item.id)}
                          >
                            {detailId === item.id ? "Details ausblenden" : "Details"}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="w-40">
                        <select
                          className="h-7 w-full rounded-md border bg-background px-1 text-xs"
                          value={item.category}
                          onChange={(e) =>
                            onUpdate(item.id, { category: e.target.value as LvItemCategory })
                          }
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c].de}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="w-28">
                        <NumCell
                          value={item.quantity}
                          onChange={(v) => onUpdate(item.id, { quantity: v })}
                        />
                        <ReviewMark show={item.quantity === null} />
                      </TableCell>
                      <TableCell className="w-24">
                        <Input
                          className="h-7 text-xs"
                          value={item.unit}
                          placeholder={EMPTY}
                          onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
                        />
                        <ReviewMark show={!item.unit.trim()} />
                      </TableCell>
                      <TableCell className="w-40">
                        <Input
                          className="h-7 text-xs"
                          value={item.frequency.label}
                          placeholder={EMPTY}
                          onChange={(e) =>
                            onUpdate(item.id, {
                              frequency: {
                                ...parseFrequency(e.target.value),
                                label: e.target.value,
                              },
                            })
                          }
                        />
                        <ReviewMark show={item.frequency.perYear === null} />
                      </TableCell>
                      <TableCell className="w-28">
                        <NumCell
                          value={item.area_m2}
                          onChange={(v) => onUpdate(item.id, { area_m2: v })}
                        />
                      </TableCell>
                      <TableCell className="w-32">
                        <NumCell
                          value={item.working_hours}
                          onChange={(v) => onUpdate(item.id, { working_hours: v })}
                        />
                      </TableCell>
                      <TableCell className="w-32">
                        <NumCell
                          value={item.calculation.own_unit_price}
                          onChange={(v) => updateCalc(item, { own_unit_price: v })}
                        />
                        <ReviewMark show={!hasOwnPrice(item)} />
                      </TableCell>
                      <TableCell className="w-28 text-right tabular-nums">
                        {total === null ? <Placeholder /> : formatMoney(total)}
                      </TableCell>
                      <TableCell className="w-28 text-right tabular-nums">
                        {annual === null ? <Placeholder /> : formatMoney(annual)}
                      </TableCell>
                      <TableCell className="w-20 text-right tabular-nums">
                        {item.vat_rate === null ? <Placeholder /> : formatNumber(item.vat_rate)}
                      </TableCell>
                      <TableCell className="w-16 text-right tabular-nums">
                        {item.source_page === null ? <Placeholder /> : item.source_page}
                      </TableCell>
                      <TableCell className="w-24 text-right">
                        <Badge variant={item.confidence_score >= 0.7 ? "secondary" : "outline"}>
                          {Math.round(item.confidence_score * 100)} %
                        </Badge>
                      </TableCell>
                      <TableCell className="w-44">
                        <Badge
                          variant={
                            calcStatus(item) === "released"
                              ? "default"
                              : calcStatus(item) === "calculated_review"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {CALC_STATUS_LABELS[calcStatus(item)]}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-24">
                        <Button
                          size="sm"
                          variant={item.approved ? "default" : "outline"}
                          className="h-7 px-2"
                          title="Position freigeben"
                          aria-label="Position freigeben"
                          onClick={() => toggleApprove(item)}
                        >
                          <CheckCircle2 className="size-3" />
                        </Button>
                      </TableCell>
                      <TableCell className="w-24">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title="Position löschen"
                          aria-label="Position löschen"
                          onClick={() => onRemove(item.id)}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Keine Position passt zu Suche und Filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobil: Kartenansicht mit allen Feldern */}
          <div className="space-y-3 md:hidden">
            {visible.map((item) => {
              const total = offerPrice(item);
              const annual = annualOfferPrice(item);
              const rows: [string, React.ReactNode][] = [
                ["Pos.", item.item_number || <Placeholder />],
                ["Kategorie", CATEGORY_LABELS[item.category].de],
                [
                  "Geforderte Menge",
                  item.quantity === null ? <Placeholder /> : formatNumber(item.quantity),
                ],
                ["Einheit", item.unit || <Placeholder />],
                ["Intervall", item.frequency.label || <Placeholder />],
                [
                  "Fläche (m²)",
                  item.area_m2 === null ? <Placeholder /> : formatNumber(item.area_m2),
                ],
                [
                  "Geforderte Arbeitsstunden",
                  item.working_hours === null ? <Placeholder /> : formatNumber(item.working_hours),
                ],
                [
                  "Eigener Einheitspreis (€)",
                  item.calculation.own_unit_price === null ? (
                    <Placeholder />
                  ) : (
                    formatMoney(item.calculation.own_unit_price)
                  ),
                ],
                ["Gesamtpreis (€)", total === null ? <Placeholder /> : formatMoney(total)],
                ["Jahrespreis (€)", annual === null ? <Placeholder /> : formatMoney(annual)],
                [
                  "MwSt. (%)",
                  item.vat_rate === null ? <Placeholder /> : formatNumber(item.vat_rate),
                ],
                ["Seite", item.source_page === null ? <Placeholder /> : item.source_page],
                ["Sicherheitswert", `${Math.round(item.confidence_score * 100)} %`],
                ["Kalkulationsstatus", CALC_STATUS_LABELS[calcStatus(item)]],
                ["Freigabe", item.approved ? "Freigegeben" : "Nicht freigegeben"],
              ];
              return (
                <Card key={item.id}>
                  <CardContent className="space-y-2 p-3 text-sm">
                    <p className="whitespace-pre-wrap break-words font-medium">
                      {item.description || <Placeholder />}
                    </p>
                    <ReviewMark show={needsReview(item)} />
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {rows.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="text-right tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <NumCell
                        value={item.calculation.own_unit_price}
                        onChange={(v) => updateCalc(item, { own_unit_price: v })}
                      />
                      <Button
                        size="sm"
                        variant={item.approved ? "default" : "outline"}
                        onClick={() => toggleApprove(item)}
                      >
                        <CheckCircle2 className="mr-1 size-3" /> Freigabe
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onRemove(item.id)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Keine Position passt zu Suche und Filter.
              </p>
            )}
          </div>

          {/* Optionale Detailansicht */}
          {detail && (
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="text-xs uppercase text-muted-foreground">
                  Detailansicht Position {detail.item_number || EMPTY}
                </p>
                <p className="whitespace-pre-wrap break-words">{detail.description || EMPTY}</p>
                <p className="text-xs text-muted-foreground">
                  Analyse-ID: {detail.analysis_id || EMPTY} · Quelle:{" "}
                  {detail.source_method || EMPTY} · Seite: {detail.source_page ?? EMPTY}
                </p>
                {reviewFields(detail).length > 0 && (
                  <p className="text-xs text-amber-700">
                    {REVIEW_LABEL}: {reviewFields(detail).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Fußbereich */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            {approvedPriced.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Position wurde freigegeben.
              </p>
            ) : summary.net === 0 ? (
              <p className="text-sm text-amber-700">
                Keine Berechnung möglich – bitte fehlende Daten ergänzen.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="text-sm">
                  Gesamtsumme der freigegebenen Positionen:{" "}
                  <span className="font-semibold tabular-nums">{formatMoney(summary.net)}</span>
                </p>
                <p className="text-sm">
                  Jahressumme der freigegebenen Positionen:{" "}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(summary.annualNet)}
                  </span>
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={exportDisabled}
                onClick={() => onExport("xlsx")}
              >
                <FileSpreadsheet className="mr-1 size-4" /> XLSX-Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportDisabled}
                onClick={() => onExport("csv")}
              >
                <Download className="mr-1 size-4" /> CSV-Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exportDisabled}
                onClick={() => onExport("pdf")}
              >
                <FileText className="mr-1 size-4" /> PDF-Bericht
              </Button>
              {exporting && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground">{exportHint}</p>
          </div>
        </>
      )}
    </div>
  );
}

export default LvPositionenTabelle;
