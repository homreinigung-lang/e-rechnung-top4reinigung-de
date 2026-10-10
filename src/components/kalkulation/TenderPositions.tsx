import {
  AlertTriangle,
  Calculator,
  CalendarRange,
  FileDown,
  FileText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { formatMoney, parseGermanNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function TenderPositions({ state }: { state: KalkulationStateContext }) {
  const {
    applyCalculation,
    calcId,
    calcOutOfSync,
    calcTitle,
    exportLv,
    importProjectLv,
    loadCalculation,
    lvCalcTotal,
    lvItems,
    lvPositions,
    lvTotal,
    monthlyHours,
    navigate,
    patchLvItem,
    projectId,
    resetCalculation,
    saveCalculation,
    savedCalcs,
    setCalcTitle,
    setLvItems,
    suggested,
    visitsPerMonth,
  } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-5" /> Leistungspositionen
        </CardTitle>
        <CardDescription>
          Positionen der Ausschreibung bzw. des Angebots – vom Assistenten erzeugt oder manuell
          ergänzt. Jede Zeile bleibt frei änderbar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Bezeichnung der Kalkulation</Label>
            <Input
              value={calcTitle}
              onChange={(e) => setCalcTitle(e.target.value)}
              placeholder="z. B. Unterhaltsreinigung Verwaltungsgebäude 2026"
            />
            {savedCalcs.length > 0 && (
              <Select
                value={calcId ?? "new"}
                onValueChange={(v) => {
                  if (v === "new") resetCalculation();
                  else loadCalculation.mutate(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Gespeicherte Kalkulation laden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Neue Kalkulation</SelectItem>
                  {savedCalcs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {(c.title || "Ohne Bezeichnung") + ` – ${formatMoney(Number(c.net_total))}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              disabled={saveCalculation.isPending}
              onClick={() => saveCalculation.mutate()}
            >
              <Save className="size-4" />
              {saveCalculation.isPending ? "Speichert …" : "Kalkulation speichern"}
            </Button>
          </div>
        </div>

        {calcOutOfSync && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/60 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertTriangle className="size-5 shrink-0" />
            <p className="flex-1">
              Das Leistungsverzeichnis weicht vom aktuellen Vorschlag ab: Bereich „Kalkulation"{" "}
              {formatMoney(lvCalcTotal)} statt {formatMoney(suggested)}. Ein Angebot würde den
              veralteten Stand übernehmen.
            </p>
            <Button type="button" size="sm" onClick={applyCalculation}>
              <Calculator className="size-4" /> Jetzt übernehmen
            </Button>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={applyCalculation}>
            <Calculator className="size-4" /> Grundkalkulation für Angebot übernehmen
          </Button>
          {projectId && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={importProjectLv.isPending}
                onClick={() => importProjectLv.mutate()}
              >
                <FileText className="size-4" /> Positionen aus Projekt-LV laden
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={monthlyHours <= 0 || visitsPerMonth <= 0}
                onClick={() =>
                  navigate({
                    to: "/team",
                    search: {
                      tab: "dienstplan",
                      projekt: projectId,
                      stunden: monthlyHours,
                      einsaetze: visitsPerMonth,
                    },
                  })
                }
              >
                <CalendarRange className="size-4" /> Einsatzplanung vorbereiten
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportLv.isPending}
            onClick={() => exportLv.mutate()}
          >
            <FileDown className="size-4" />
            {exportLv.isPending ? "PDF wird erstellt …" : "LV als PDF exportieren"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLvItems((prev) => [
                ...prev,
                {
                  id: `${Date.now()}`,
                  description: "",
                  quantity: "1",
                  unit: "Std.",
                  unit_price: "35",
                },
              ])
            }
          >
            <Plus className="size-4" /> Position
          </Button>
        </div>

        {lvPositions.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Noch keine Positionen. Beschreiben Sie die Arbeit im KI-Assistenten (Tab „Grundriss")
            oder fügen Sie eine Position manuell hinzu.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden gap-2 px-1 text-xs text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem]">
              <span>Leistung</span>
              <span>Menge</span>
              <span>Einheit</span>
              <span>Einzelpreis</span>
              <span className="text-right">Gesamt</span>
              <span />
            </div>
            {lvItems.map((i) => (
              <div
                key={i.id}
                className="grid gap-2 sm:grid-cols-[1fr_5rem_6rem_7rem_7rem_2.5rem] sm:items-center"
              >
                <Input
                  value={i.description}
                  placeholder="Leistung"
                  onChange={(e) => patchLvItem(i.id, { description: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  value={i.quantity}
                  onChange={(e) => patchLvItem(i.id, { quantity: e.target.value })}
                />
                <Input
                  value={i.unit}
                  onChange={(e) => patchLvItem(i.id, { unit: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  value={i.unit_price}
                  onChange={(e) => patchLvItem(i.id, { unit_price: e.target.value })}
                />
                <span className="text-sm sm:text-right">
                  {formatMoney(num(i.quantity) * parseGermanNumber(i.unit_price))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Position entfernen"
                  onClick={() => setLvItems((prev) => prev.filter((x) => x.id !== i.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
              <span>Gesamt netto</span>
              <span>{formatMoney(lvTotal)}</span>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {lvPositions.length} Position(en) – Summe aus Menge × Einzelpreis
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
