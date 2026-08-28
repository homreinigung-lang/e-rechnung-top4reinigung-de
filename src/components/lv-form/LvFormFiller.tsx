import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, FolderOpen, Loader2, Move, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FILES_BUCKET } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveFile } from "@/lib/download";
import { detectLvForm } from "@/lib/lv-form/detect";
import { LV_FIELDS, fieldLabel } from "@/lib/lv-form/fields";
import { EMPTY_LV_INPUTS, deriveLvValues } from "@/lib/lv-form/derive";
import { fieldValueText, fillAcroForm, fillFlatPdf } from "@/lib/lv-form/fill";
import {
  formatCents,
  formatGermanNumber,
  parseGermanCents,
  parseGermanNumber,
} from "@/lib/lv-form/number";
import { hasBlockingWarnings, validateLvForm } from "@/lib/lv-form/validate";
import type { LvDetection, LvFieldKey, LvInputs, LvMarker } from "@/lib/lv-form/types";

type MoneyKey = "unterhalt_pauschale_monat" | "grund_pauschale_jahr" | "sonder_stundensatz";
type PlainKey = Exclude<keyof LvInputs, MoneyKey>;

const MONEY_FIELDS: { key: MoneyKey; label: string }[] = [
  { key: "unterhalt_pauschale_monat", label: "Pauschalpreis pro Monat (netto)" },
  { key: "grund_pauschale_jahr", label: "Grundreinigung – Pauschale 1× jährlich (netto)" },
  { key: "sonder_stundensatz", label: "Stundenverrechnungssatz Sonderaufträge (netto)" },
];

const PLAIN_FIELDS: { key: PlainKey; label: string; unit: string }[] = [
  { key: "unterhalt_stunden_monat", label: "Zugrunde liegende Stunden pro Monat", unit: "Std." },
  { key: "grund_stunden_jahr", label: "Grundreinigung – Stunden pro Jahr", unit: "Std." },
  { key: "sonder_kontingent", label: "Fiktives Stundenkontingent pro Jahr", unit: "Std." },
  { key: "mwst_satz", label: "Mehrwertsteuersatz", unit: "%" },
];

const DERIVED_ROWS: { key: LvFieldKey; label: string; formula: string }[] = [
  {
    key: "unterhalt_wertung",
    label: "Wertungseintrag Unterhaltsreinigung",
    formula: "Monatspauschale × 12",
  },
  { key: "grund_wertung", label: "Wertungseintrag Grundreinigung", formula: "Jahrespauschale × 1" },
  {
    key: "sonder_wertung",
    label: "Wertungseintrag Sonderaufträge",
    formula: "Stundensatz × Kontingent",
  },
  { key: "jahr_netto", label: "Jahresbetrag netto", formula: "Summe der Wertungseinträge" },
  { key: "mwst_betrag", label: "Mehrwertsteuer", formula: "netto × Satz" },
  { key: "jahr_brutto", label: "Jahresbetrag brutto", formula: "netto + MwSt." },
];

function markerColor(marker: LvMarker): string {
  if (!marker.key) return "border-muted-foreground/40 bg-muted text-muted-foreground";
  if (marker.manual || marker.confidence === "high")
    return "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
  if (marker.confidence === "medium")
    return "border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-100";
  return "border-muted-foreground/40 bg-muted text-muted-foreground";
}

/**
 * Eigenständiger PDF-Formular-Ausfüller für Leistungsverzeichnisse.
 * Erzeugt niemals eine Ausgabedatei ohne ausdrückliche Bestätigung.
 */
export function LvFormFiller() {
  const [file, setFile] = useState<File | null>(null);
  const [detection, setDetection] = useState<LvDetection | null>(null);
  const [markers, setMarkers] = useState<LvMarker[]>([]);
  const [mapping, setMapping] = useState<Record<string, LvFieldKey | null>>({});
  const [inputText, setInputText] = useState<Record<string, string>>({ mwst_satz: "19,00" });
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

  const inputs: LvInputs = useMemo(() => {
    const next = { ...EMPTY_LV_INPUTS };
    for (const { key } of MONEY_FIELDS) next[key] = parseGermanCents(inputText[key] ?? "") ?? 0;
    for (const { key } of PLAIN_FIELDS) {
      const value = parseGermanNumber(inputText[key] ?? "");
      next[key] = value ?? (key === "mwst_satz" ? 19 : 0);
    }
    return next;
  }, [inputText]);

  const derived = useMemo(() => deriveLvValues(inputs), [inputs]);
  const warnings = useMemo(
    () => validateLvForm(inputs, derived, detection?.constraints ?? []),
    [inputs, derived, detection],
  );
  const blocking = hasBlockingWarnings(warnings);
  const page = detection?.pages[activePage];
  const pageMarkers = markers.filter((m) => m.pageIndex === activePage);

  async function handleFile(next: File | null) {
    if (!next) return;
    setFile(next);
    setDetection(null);
    setMarkers([]);
    setMapping({});
    setAccepted(false);
    setAnalyzing(true);
    try {
      const result = await detectLvForm(next);
      setDetection(result);
      setMarkers(result.markers);
      setMapping(Object.fromEntries(result.acroFields.map((f) => [f.name, f.suggestedKey])));
      setActivePage(0);
      const vat = result.constraints.find((c) => c.kind === "vat_rate");
      if (vat) setInputText((prev) => ({ ...prev, mwst_satz: formatGermanNumber(vat.value) }));
      const quota = result.constraints.find((c) => c.kind === "fixed_quota_year");
      if (quota)
        setInputText((prev) => ({
          ...prev,
          sonder_kontingent: prev["sonder_kontingent"] ?? formatGermanNumber(quota.value),
        }));
      const minMonth = result.constraints.find((c) => c.kind === "min_hours_month");
      if (minMonth)
        setInputText((prev) => ({
          ...prev,
          unterhalt_stunden_monat:
            prev["unterhalt_stunden_monat"] ?? formatGermanNumber(minMonth.value),
        }));
      toast.success(
        result.type === "acroform"
          ? "Ausfüllbares Formular-PDF erkannt."
          : "Flaches PDF erkannt – bitte alle Vorschläge prüfen.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht gelesen werden.");
    } finally {
      setAnalyzing(false);
    }
  }

  function patchMarker(id: string, values: Partial<LvMarker>) {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...values } : m)));
  }

  function addMarkerAt(event: React.MouseEvent<HTMLDivElement>) {
    if (!page) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * page.width;
    const relY = page.height - ((event.clientY - rect.top) / rect.height) * page.height;
    setMarkers((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        key: null,
        pageIndex: activePage,
        x: relX,
        y: relY,
        width: 80,
        fontSize: 10,
        confidence: "high",
        sourceLine: "Manuell gesetzt",
        manual: true,
      },
    ]);
  }

  function onMarkerDrag(event: React.MouseEvent, marker: LvMarker) {
    event.stopPropagation();
    const container = (event.currentTarget as HTMLElement).parentElement;
    if (!container || !page) return;
    dragRef.current = { id: marker.id, startX: event.clientX, startY: event.clientY };
    const rect = container.getBoundingClientRect();
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const x = ((e.clientX - rect.left) / rect.width) * page.width;
      const y = page.height - ((e.clientY - rect.top) / rect.height) * page.height;
      patchMarker(marker.id, { x, y, manual: true });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  async function handleExport() {
    if (!file || !detection) return;
    if (blocking && !accepted) {
      toast.error("Bitte die Abweichung ausdrücklich bestätigen.");
      return;
    }
    setBusy(true);
    try {
      const bytes =
        detection.type === "acroform"
          ? await fillAcroForm(file, mapping, inputs, derived)
          : await fillFlatPdf(
              file,
              markers.filter((m) => m.key),
              inputs,
              derived,
            );
      const name = file.name.replace(/\.pdf$/i, "");
      await saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${name}-ausgefuellt.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Leistungsverzeichnis hochladen</h2>
            <p className="text-sm text-muted-foreground">
              Das Original-PDF der Ausschreibung wird nur gelesen. Erst nach Ihrer Bestätigung wird
              eine ausgefüllte Kopie erzeugt.
            </p>
          </div>
          {analyzing && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> PDF wird analysiert …
            </span>
          )}
        </div>
        <Input
          type="file"
          accept="application/pdf"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
        {detection && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-3 py-1">
              {detection.type === "acroform"
                ? "Ausfüllbares Formular (AcroForm)"
                : "Flaches PDF – Vorschlagsmodus"}
            </span>
            <span className="rounded-full border px-3 py-1">{detection.pages.length} Seiten</span>
            <span className="rounded-full border px-3 py-1">
              {markers.filter((m) => m.key).length} zugeordnete Positionen
            </span>
            {detection.scanned && (
              <span className="rounded-full border border-amber-500 px-3 py-1 text-amber-700">
                Keine Textebene gefunden – Positionen bitte manuell setzen
              </span>
            )}
          </div>
        )}
      </section>

      {detection && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="surface space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Vorschau &amp; Korrektur</h2>
              <div className="flex gap-1">
                {detection.pages.map((p) => (
                  <Button
                    key={p.index}
                    size="sm"
                    variant={p.index === activePage ? "default" : "outline"}
                    onClick={() => setActivePage(p.index)}
                  >
                    Seite {p.index + 1}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Klick auf eine freie Stelle setzt eine neue Position. Marker lassen sich am Griff
              verschieben und über die Auswahl einer Kennzahl zuordnen.
            </p>

            {page && (
              <div
                className="relative w-full cursor-crosshair overflow-hidden rounded-md border"
                onClick={addMarkerAt}
              >
                <img
                  src={page.imageDataUrl}
                  alt={`Seite ${page.index + 1} des Leistungsverzeichnisses`}
                  className="w-full select-none"
                  draggable={false}
                />
                {pageMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute flex -translate-y-1/2 items-center gap-1 rounded border px-1 py-0.5 text-[11px] shadow-sm ${markerColor(marker)}`}
                    style={{
                      left: `${(marker.x / page.width) * 100}%`,
                      top: `${((page.height - marker.y) / page.height) * 100}%`,
                    }}
                  >
                    <button
                      type="button"
                      title="Verschieben"
                      className="cursor-move"
                      onMouseDown={(e) => onMarkerDrag(e, marker)}
                    >
                      <Move className="size-3" />
                    </button>
                    <select
                      className="max-w-[150px] bg-transparent text-[11px] outline-none"
                      value={marker.key ?? ""}
                      onChange={(e) =>
                        patchMarker(marker.id, {
                          key: (e.target.value || null) as LvFieldKey | null,
                          manual: true,
                        })
                      }
                    >
                      <option value="">– nicht ausfüllen –</option>
                      {LV_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <span className="font-semibold tabular-nums">
                      {marker.key ? fieldValueText(marker.key, inputs, derived) : "—"}
                    </span>
                    <button
                      type="button"
                      title="Position entfernen"
                      onClick={() => setMarkers((prev) => prev.filter((m) => m.id !== marker.id))}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="surface space-y-4 p-5">
              <h2 className="font-display text-lg font-semibold">Basiswerte</h2>
              {MONEY_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`lv-${f.key}`}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`lv-${f.key}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={inputText[f.key] ?? ""}
                      onChange={(e) =>
                        setInputText((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">€</span>
                  </div>
                </div>
              ))}
              {PLAIN_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`lv-${f.key}`}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`lv-${f.key}`}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={inputText[f.key] ?? ""}
                      onChange={(e) =>
                        setInputText((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">{f.unit}</span>
                  </div>
                </div>
              ))}
            </section>

            <section className="surface space-y-2 p-5">
              <h2 className="font-display text-lg font-semibold">Abgeleitete Werte</h2>
              <p className="text-xs text-muted-foreground">
                Werden automatisch berechnet und können nicht manuell überschrieben werden.
              </p>
              <ul className="divide-y text-sm">
                {DERIVED_ROWS.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {row.label}
                      <span className="block text-xs text-muted-foreground">{row.formula}</span>
                    </span>
                    <span className="font-semibold tabular-nums whitespace-nowrap">
                      {formatCents(derived[row.key as keyof typeof derived] as number)} €
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {detection.type === "acroform" && detection.acroFields.length > 0 && (
              <section className="surface space-y-3 p-5">
                <h2 className="font-display text-lg font-semibold">Feld-Zuordnung</h2>
                {detection.acroFields.map((f) => (
                  <div key={f.name} className="space-y-1">
                    <Label>{f.name}</Label>
                    <Select
                      value={mapping[f.name] ?? "none"}
                      onValueChange={(v) =>
                        setMapping((prev) => ({
                          ...prev,
                          [f.name]: v === "none" ? null : (v as LvFieldKey),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kennzahl wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">– nicht ausfüllen –</SelectItem>
                        {LV_FIELDS.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </section>
            )}

            <section className="surface space-y-3 p-5">
              <h2 className="font-display text-lg font-semibold">Prüfung &amp; Export</h2>
              {warnings.length === 0 ? (
                <p className="inline-flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="size-4" /> Keine Auffälligkeiten gefunden.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {warnings.map((w, i) => (
                    <li
                      key={i}
                      className={`rounded-md border p-3 ${
                        w.level === "hard"
                          ? "border-destructive/50 bg-destructive/10"
                          : "border-amber-500/50 bg-amber-500/10"
                      }`}
                    >
                      <span className="inline-flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {w.message}
                          {w.detail && (
                            <span className="block text-xs text-muted-foreground">{w.detail}</span>
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {blocking && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
                  <span>Abweichung ist gewollt – ich habe die Warnungen geprüft.</span>
                </label>
              )}

              <Button
                className="w-full"
                disabled={busy || (blocking && !accepted) || markers.every((m) => !m.key) === (detection.type !== "acroform")}
                onClick={() => void handleExport()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                Ausgefülltes PDF erzeugen
              </Button>
              <p className="text-xs text-muted-foreground">
                Es werden ausschließlich die oben sichtbaren Werte an den geprüften Positionen
                gedruckt. Zuordnung:{" "}
                {markers
                  .filter((m) => m.key)
                  .map((m) => fieldLabel(m.key))
                  .slice(0, 3)
                  .join(", ") || "noch keine"}
                .
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
