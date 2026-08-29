import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { formatDate, formatMoney, formatNumber, parsePositiveNumber } from "@/lib/format";

/** Datensatz einer LV-Position (entspricht public.project_lv_items). */
export type LvPositionItem = {
  id: string;
  position: number;
  section: string;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  deadline: string | null;
  evidence: string;
  critical: boolean;
  done: boolean;
};

export type LvStatus = "offen" | "pruefen" | "fertig";

const STATUS_LABEL: Record<LvStatus, string> = {
  offen: "Offen",
  pruefen: "Prüfen",
  fertig: "Fertig",
};

const STATUS_DOT: Record<LvStatus, string> = {
  offen: "bg-red-500",
  pruefen: "bg-amber-500",
  fertig: "bg-emerald-600",
};

/** Fehlende Pflichtangaben einer Position (leer = vollständig). */
export function missingFields(it: LvPositionItem): string[] {
  const missing: string[] = [];
  if (!(Number(it.quantity) > 0)) missing.push("Menge");
  if (!it.unit.trim()) missing.push("Einheit");
  if (!(Number(it.unit_price) > 0)) missing.push("Preis / Einheit");
  return missing;
}

/** Hinweise, die eine Prüfung empfehlen, aber nicht blockieren. */
export function warningFields(it: LvPositionItem): string[] {
  const warn: string[] = [];
  if (!it.title.trim() && !it.description.trim()) warn.push("Beschreibung fehlt");
  if (it.critical && !it.done) warn.push("Kritischer Punkt / Frist noch offen");
  if (it.evidence.trim() && !it.done) warn.push("Nachweis noch nicht bestätigt");
  if (Number(it.unit_price) > 0 && Number(it.unit_price) > 500)
    warn.push("Ungewöhnlich hoher Einzelpreis");
  return warn;
}

export function lvStatus(it: LvPositionItem): LvStatus {
  if (missingFields(it).length > 0) return "offen";
  if (warningFields(it).length > 0) return "pruefen";
  return "fertig";
}

function total(it: LvPositionItem): number {
  return Math.round(Number(it.quantity || 0) * Number(it.unit_price || 0) * 100) / 100;
}

function posLabel(it: LvPositionItem): string {
  return String(it.position ?? 0).padStart(3, "0");
}

function StatusBadge({ status }: { status: LvStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

type Props = {
  items: LvPositionItem[];
  onPatch: (itemId: string, values: Partial<LvPositionItem>) => void;
  onAdd: () => void;
  onRemove: (itemId: string) => void;
};

/**
 * Kompakte Arbeitsansicht des Leistungsverzeichnisses:
 * Übersicht → Filter/Suche → Detailbearbeitung mit automatischer Berechnung.
 */
export function LvPositionen({ items, onPatch, onAdd, onRemove }: Props) {
  const [filter, setFilter] = useState<"alle" | LvStatus>("alle");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { offen: 0, pruefen: 0, fertig: 0 };
    for (const it of items) c[lvStatus(it)] += 1;
    return c;
  }, [items]);

  const sumTotal = useMemo(() => items.reduce((s, it) => s + total(it), 0), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "alle" && lvStatus(it) !== filter) return false;
      if (!q) return true;
      return [posLabel(it), it.section, it.title, it.description]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, filter, query]);

  const selected = items.find((it) => it.id === selectedId) ?? null;
  const selIndex = selected ? visible.findIndex((it) => it.id === selected.id) : -1;

  /** Offene Positionen ab der aktuellen Position (umlaufend), ohne die aktuelle. */
  function openOthers(currentId: string): LvPositionItem[] {
    const base = visible.length > 0 ? visible : items;
    const start = base.findIndex((it) => it.id === currentId);
    const ordered = start >= 0 ? [...base.slice(start + 1), ...base.slice(0, start)] : base;
    return ordered.filter((it) => it.id !== currentId && lvStatus(it) === "offen");
  }

  return (
    <div className="space-y-4">
      {/* Fortschritt & Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{items.length} Positionen</span>
        {(
          [
            ["alle", `Alle ${items.length}`],
            ["fertig", `Fertig ${counts.fertig}`],
            ["pruefen", `Prüfen ${counts.pruefen}`],
            ["offen", `Offen ${counts.offen}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
              filter === key ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/60"
            }`}
          >
            {key !== "alle" && <span className={`size-2 rounded-full ${STATUS_DOT[key]}`} />}
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          Summe netto: <span className="tabular-nums font-medium">{formatMoney(sumTotal)}</span>
        </span>
      </div>

      {counts.offen > 0 && (
        <button
          type="button"
          onClick={() => setFilter("offen")}
          className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-900"
        >
          {counts.offen} Position(en) benötigen noch Angaben – anzeigen
        </button>
      )}

      {/* Suche */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Position oder Beschreibung suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Noch keine Positionen. Ausschreibung hochladen oder Positionen manuell ergänzen.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Tabelle */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Pos.</th>
                  <th className="py-2 pr-3">Beschreibung</th>
                  <th className="py-2 pr-3 text-right">Menge</th>
                  <th className="py-2 pr-3">Einheit</th>
                  <th className="py-2 pr-3 text-right">Preis / Einheit</th>
                  <th className="py-2 pr-3 text-right">Gesamtpreis</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => {
                  const status = lvStatus(it);
                  const priced = Number(it.unit_price) > 0;
                  return (
                    <tr
                      key={it.id}
                      onClick={() => setSelectedId(it.id)}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                        selectedId === it.id ? "bg-muted/70" : ""
                      }`}
                    >
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {posLabel(it)}
                      </td>
                      <td className="max-w-[22rem] py-1.5 pr-3">
                        <div className="truncate font-medium">
                          {it.title || "Ohne Bezeichnung"}
                        </div>
                        {it.section && (
                          <div className="truncate text-xs text-muted-foreground">
                            {it.section}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {Number(it.quantity) > 0 ? formatNumber(Number(it.quantity)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {it.unit || "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {priced ? formatMoney(Number(it.unit_price)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                        {priced && Number(it.quantity) > 0 ? formatMoney(total(it)) : "—"}
                      </td>
                      <td className="py-1.5 pr-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <ConfirmDeleteButton
                          title="Position wirklich löschen?"
                          description={`Die Position „${it.title || "ohne Titel"}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
                          onConfirm={() => {
                            if (selectedId === it.id) setSelectedId(null);
                            onRemove(it.id);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      Keine Position passt zu Suche und Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="pt-3">
              <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="size-4" /> Position ergänzen
              </Button>
            </div>
          </div>

          {/* Detailbereich */}
          <div className="rounded-lg border p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Position in der Tabelle auswählen, um Angaben zu ergänzen.
              </p>
            ) : (
              <LvDetail
                key={selected.id}
                item={selected}
                onPatch={onPatch}
                onClose={() => setSelectedId(null)}
                hasPrev={selIndex > 0}
                hasNext={selIndex >= 0 && selIndex < visible.length - 1}
                onPrev={() => setSelectedId(visible[selIndex - 1]?.id ?? null)}
                onNext={() => setSelectedId(visible[selIndex + 1]?.id ?? null)}
                positionIndex={selIndex >= 0 ? selIndex + 1 : 1}
                positionCount={visible.length}
                openCount={openOthers(selected.id).length}
                onNextOpen={() => {
                  const next = openOthers(selected.id)[0];
                  if (next) setSelectedId(next.id);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LvDetail({
  item,
  onPatch,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  positionIndex,
  positionCount,
  openCount,
  onNextOpen,
}: {
  item: LvPositionItem;
  onPatch: (itemId: string, values: Partial<LvPositionItem>) => void;
  onClose: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  positionIndex: number;
  positionCount: number;
  openCount: number;
  onNextOpen: () => void;
}) {
  const [price, setPrice] = useState(
    Number(item.unit_price) > 0 ? String(item.unit_price).replace(".", ",") : "",
  );
  const [showCalc, setShowCalc] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const priceValue = parsePositiveNumber(price);
  const quantity = Number(item.quantity || 0);
  const sum = Math.round(quantity * priceValue * 100) / 100;
  const draft = { ...item, unit_price: priceValue };
  const missing = missingFields(draft);
  const warnings = warningFields(draft);
  const status = lvStatus(draft);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  /** Speichert nur bei echter Änderung – ohne Rückfrage. */
  const save = useCallback(
    (values: Partial<LvPositionItem>) => {
      const changed = Object.entries(values).some(
        ([k, v]) => (item as unknown as Record<string, unknown>)[k] !== v,
      );
      if (!changed) return;
      onPatch(item.id, values);
      flashSaved();
    },
    [item, onPatch, flashSaved],
  );

  const commitPrice = useCallback(() => {
    save({ unit_price: priceValue });
  }, [save, priceValue]);

  // Automatisches Speichern des Preises kurz nach der Eingabe.
  useEffect(() => {
    if (priceValue === Number(item.unit_price)) return;
    const t = setTimeout(() => save({ unit_price: priceValue }), 700);
    return () => clearTimeout(t);
  }, [priceValue, item.unit_price, save]);

  const required = [
    { label: "Menge", ok: quantity > 0 },
    { label: "Einheit", ok: Boolean(item.unit.trim()) },
    { label: "Beschreibung", ok: Boolean(item.title.trim() || item.description.trim()) },
    { label: "Preis / Einheit", ok: priceValue > 0 },
  ];
  const completion = Math.round(
    (required.filter((r) => r.ok).length / required.length) * 100,
  );

  return (
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          commitPrice();
          flashSaved();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            Position {positionIndex} von {positionCount}
          </div>
          <h3 className="font-semibold">{item.title || "Ohne Bezeichnung"}</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Detail schließen">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <span
          className={`text-xs text-muted-foreground transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}
          aria-live="polite"
        >
          <Check className="mr-1 inline size-3" />
          Gespeichert
        </span>
      </div>

      {/* Pflichtangaben & Fortschritt */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted-foreground">
            Pflichtangaben
          </span>
          <span className="tabular-nums text-muted-foreground">{completion} % vollständig</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${completion}%` }}
          />
        </div>
        <ul className="grid gap-1 text-sm">
          {required.map((r) => (
            <li
              key={r.label}
              className={`flex items-center gap-2 ${
                r.ok ? "text-muted-foreground" : "font-medium"
              }`}
            >
              {r.ok ? (
                <Check className="size-3.5 text-muted-foreground" />
              ) : (
                <span className="size-2 rounded-full border border-foreground/60" />
              )}
              {r.label}
            </li>
          ))}
          <li className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full border border-muted-foreground/40" />
            Bemerkung – optional
          </li>
        </ul>
      </div>

      {/* Ausschreibung – visuell zweitrangig */}
      <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ausschreibung
        </div>
        <div className="grid gap-2">
          <Input
            defaultValue={item.section}
            placeholder="Leistungsbereich"
            onBlur={(e) => save({ section: e.target.value })}
          />
          <Input
            defaultValue={item.title}
            placeholder="Position"
            onBlur={(e) => save({ title: e.target.value })}
          />
          <Textarea
            rows={2}
            defaultValue={item.description}
            placeholder="Leistungsbeschreibung"
            onBlur={(e) => save({ description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">
                Menge{quantity <= 0 && <span className="ml-0.5 text-muted-foreground">*</span>}
              </Label>
              <Input
                autoFocus={quantity <= 0}
                defaultValue={quantity > 0 ? String(quantity).replace(".", ",") : ""}
                placeholder="0,00"
                className={quantity > 0 ? "" : "border-dashed border-foreground/40"}
                onBlur={(e) => save({ quantity: parsePositiveNumber(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Einheit
                {!item.unit.trim() && <span className="ml-0.5 text-muted-foreground">*</span>}
              </Label>
              <Input
                autoFocus={quantity > 0 && !item.unit.trim()}
                defaultValue={item.unit}
                placeholder="m², Std., pauschal"
                className={item.unit.trim() ? "" : "border-dashed border-foreground/40"}
                onBlur={(e) => save({ unit: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Frist</Label>
              <Input
                type="date"
                defaultValue={item.deadline ?? ""}
                onBlur={(e) => save({ deadline: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Geforderter Nachweis</Label>
              <Input
                defaultValue={item.evidence}
                placeholder="z. B. Referenz"
                onBlur={(e) => save({ evidence: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={item.critical}
              onCheckedChange={(v) => save({ critical: Boolean(v) })}
            />
            Kritischer Punkt / Frist
            {item.deadline && <span> – fällig am {formatDate(item.deadline)}</span>}
          </label>
        </div>
      </div>

      {/* Eigene Kalkulation – Hauptarbeitsbereich */}
      <div className="space-y-3 rounded-md border-2 border-foreground/15 bg-background p-3 shadow-sm">
        <div className="text-sm font-semibold">Ihre Kalkulation</div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`price-${item.id}`}>
            Preis / Einheit (netto)
            {priceValue <= 0 && <span className="ml-0.5 text-muted-foreground">*</span>}
          </Label>
          <Input
            id={`price-${item.id}`}
            inputMode="decimal"
            placeholder="0,00 €"
            value={price}
            autoFocus={quantity > 0 && Boolean(item.unit.trim())}
            className={priceValue > 0 ? "font-medium" : "border-dashed border-foreground/40"}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPrice();
                if (openCount > 0) onNextOpen();
                else if (hasNext) onNext();
              }
            }}
          />
        </div>
        <div className="flex items-baseline justify-between rounded-md bg-muted/60 px-3 py-2">
          <span className="text-sm">Gesamtpreis</span>
          <span className="tabular-nums text-xl font-bold">{formatMoney(sum)}</span>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowCalc((v) => !v)}
        >
          {showCalc ? "Berechnung ausblenden" : "Berechnung anzeigen"}
        </button>
        {showCalc && (
          <p className="text-xs text-muted-foreground">
            {formatNumber(quantity)} {item.unit || "Einheiten"} × {formatMoney(priceValue)} ={" "}
            {formatMoney(sum)}
          </p>
        )}
        <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Checkbox checked={item.done} onCheckedChange={(v) => save({ done: Boolean(v) })} />
          Position geprüft
        </label>
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <div className="font-medium">Fehler</div>
          Pflichtangabe fehlt: {missing.join(", ")}
        </div>
      )}
      {missing.length === 0 && warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">Warnung</div>
          Bitte prüfen – blockiert den Abschluss nicht: {warnings.join(", ")}
        </div>
      )}
      {missing.length === 0 && warnings.length === 0 && (
        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">Hinweis</div>
          Position ist vollständig. Enter springt zur nächsten offenen Position.
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <Button
          size="sm"
          className="w-full"
          disabled={openCount === 0}
          onClick={() => {
            commitPrice();
            onNextOpen();
          }}
        >
          Nächste offene Position <ChevronRight className="size-4" />
        </Button>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
            <ChevronLeft className="size-4" /> Vorherige
          </Button>
          <span className="text-[11px] text-muted-foreground">Enter · Tab · Strg+S</span>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
            Nächste <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

