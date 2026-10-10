import { Calculator } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/format";
import { type RecurrenceUnit } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mode, CLEANING_TYPES, EXTRAS, num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";
import { FloorplanAttachments } from "./FloorplanAttachments";

export function CleaningParameters({ state }: { state: KalkulationStateContext }) {
  const {
    annualVisits,
    area,
    extras,
    floors,
    frequency,
    frequencyUnit,
    glassArea,
    hasLift,
    hourlyRate,
    hours,
    liftRate,
    mode,
    note,
    pricePerSqm,
    raumbuch,
    raumbuchApplied,
    search,
    selected,
    setArea,
    setExtras,
    setFloors,
    setFrequency,
    setFrequencyUnit,
    setGlassArea,
    setHasLift,
    setHourlyRate,
    setHours,
    setLiftRate,
    setMode,
    setNote,
    setPricePerSqm,
    setStairFrequency,
    setStairRate,
    setStairs,
    setTravel,
    setType,
    stairFrequency,
    stairRate,
    stairVisitsPerMonth,
    stairs,
    stairsTotal,
    travel,
    type,
    visitsPerMonth,
  } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="size-5" /> Leistungsdaten
        </CardTitle>
        <CardDescription>Reinigungstyp, Umfang und Zusatzoptionen</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reinigungstyp</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                const t = CLEANING_TYPES.find((x) => x.value === v);
                if (t) {
                  setPricePerSqm(String(t.area));
                  setHourlyRate(String(t.hourly));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLEANING_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Berechnungsart</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="area">Nach Fläche (m²)</SelectItem>
                <SelectItem value="hours">Nach Stunden</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "area" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fläche (m²)</Label>
              <Input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
              {raumbuchApplied && raumbuch ? (
                <p className="text-xs text-sky-700 dark:text-sky-400">
                  Aus Raumbuch übernommen – {raumbuch.roomCount} Räume aus dem Grundriss-Scan
                  (manuell überschreibbar).
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Preis pro m² (netto)</Label>
              <Input
                inputMode="decimal"
                value={pricePerSqm}
                onChange={(e) => setPricePerSqm(e.target.value)}
              />
            </div>
          </div>
        ) : null}

        {selected.value === "glas" && (
          <div className="space-y-2 rounded-md border p-3">
            <Label>Glasfläche (m²) – getrennt von der Bodenfläche</Label>
            <Input
              inputMode="decimal"
              value={glassArea}
              onChange={(e) => setGlassArea(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Für Glas- und Fensterreinigung wird ausschließlich diese Fläche kalkuliert (Leistung:
              40 m² pro Stunde).
            </p>
          </div>
        )}

        {mode === "hours" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Stunden</Label>
              <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
              {raumbuchApplied && raumbuch ? (
                <p className="text-xs text-sky-700 dark:text-sky-400">
                  Aus Raumbuch berechnet – Leistungswerte für {raumbuch.matched} Räume
                  {raumbuch.unmatched > 0 ? `, ${raumbuch.unmatched} pauschal` : ""} (manuell
                  überschreibbar).
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Stundensatz (netto)</Label>
              <Input
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Empfehlung {selected.label}: {formatMoney(selected.range[0])} –{" "}
                {formatMoney(selected.range[1])} pro Stunde. Frei überschreibbar – die Summe
                aktualisiert sich sofort.
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  selected.range[0],
                  Math.round((selected.range[0] + selected.range[1]) / 2),
                  selected.range[1],
                ].map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setHourlyRate(String(r))}
                  >
                    {formatMoney(r)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Durchgänge / Einsätze</Label>
            <Input
              inputMode="decimal"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Zeitraum</Label>
            <Select
              value={frequencyUnit}
              onValueChange={(v) => setFrequencyUnit(v as RecurrenceUnit)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Pro Woche</SelectItem>
                <SelectItem value="fortnight">Alle 2 Wochen (14-tägig)</SelectItem>
                <SelectItem value="month">Pro Monat</SelectItem>
                <SelectItem value="quarter">Pro Quartal</SelectItem>
                <SelectItem value="year">Pro Jahr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Anfahrtspauschale (netto)</Label>
            <Input inputMode="decimal" value={travel} onChange={(e) => setTravel(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Jahresbasis: {formatNumber(annualVisits)} Einsätze/Jahr ÷ 12 ={" "}
          {formatNumber(visitsPerMonth)} Einsätze pro Monat. Wochenbasierte Turnusse rechnen
          verbindlich mit 52 Wochen/Jahr.
        </p>

        {search.area ? (
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            Vorschlagswerte aus der Projekt-Analyse übernommen: {formatNumber(search.area)} m²
            {search.belag ? ` · Bodenbelag ${search.belag}` : ""}. Bitte prüfen und bei Bedarf
            anpassen.
          </p>
        ) : null}

        <div className="space-y-2">
          <Label>Zusatzoptionen</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXTRAS.map((e) => (
              <label
                key={e.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
              >
                <Checkbox
                  checked={extras.includes(e.key)}
                  onCheckedChange={(checked) =>
                    setExtras((prev) =>
                      checked ? [...prev, e.key] : prev.filter((k) => k !== e.key),
                    )
                  }
                />
                <span className="flex-1">{e.label}</span>
                <span className="text-muted-foreground">{formatMoney(e.price)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={stairs} onCheckedChange={(checked) => setStairs(Boolean(checked))} />
            <span>Treppenhausreinigung</span>
          </label>
          {stairs && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Anzahl der Etagen</Label>
                  <Input
                    inputMode="decimal"
                    value={floors}
                    onChange={(e) => setFloors(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preis pro Etage (netto)</Label>
                  <Input
                    inputMode="decimal"
                    value={stairRate}
                    onChange={(e) => setStairRate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Treppenhaus-Turnus (Einsätze pro Monat)</Label>
                <Input
                  inputMode="decimal"
                  value={stairFrequency}
                  onChange={(e) => setStairFrequency(e.target.value)}
                  placeholder="0 = wie Grundleistung"
                />
                <p className="text-xs text-muted-foreground">
                  Eigener Turnus, z. B. „2" für zweimal monatlich bei wöchentlicher
                  Unterhaltsreinigung. 0 übernimmt den Turnus der Grundleistung (
                  {formatNumber(visitsPerMonth)} Einsätze/Monat).
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Gibt es einen Aufzug?</Label>
                  <Select
                    value={hasLift ? "yes" : "no"}
                    onValueChange={(v) => setHasLift(v === "yes")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Nein – kein Aufzug</SelectItem>
                      <SelectItem value="yes">Ja – Aufzug vorhanden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasLift && (
                  <div className="space-y-2">
                    <Label>Aufzugkabine pro Einsatz (netto)</Label>
                    <Input
                      inputMode="decimal"
                      value={liftRate}
                      onChange={(e) => setLiftRate(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                ({formatNumber(num(floors))} Etagen × {formatMoney(num(stairRate))}
                {hasLift ? ` + Aufzug ${formatMoney(num(liftRate))}` : ""}) ×{" "}
                {formatNumber(stairVisitsPerMonth)} Einsätze = {formatMoney(stairsTotal)}
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label>Bemerkung zur Leistung</Label>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Reinigung wöchentlich, Zutritt nach Absprache"
          />
        </div>

        <FloorplanAttachments state={state} />
      </CardContent>
    </Card>
  );
}
