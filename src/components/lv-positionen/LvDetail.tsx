import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { formatDate, formatMoney, formatNumber, parsePositiveNumber } from "@/lib/format";
import { type LvPositionItem, missingFields, warningFields, lvStatus } from "./shared";
import { StatusBadge } from "@/components/lv-positionen/StatusBadge";

export function LvDetail({
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
  const completion = Math.round((required.filter((r) => r.ok).length / required.length) * 100);

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
