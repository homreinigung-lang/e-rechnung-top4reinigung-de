import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/auth-user";
import { AlertTriangle } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/format";
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
import { CLEANING_TYPES, num } from "./shared";
import { NonproductiveTimePanel } from "./NonproductiveTimePanel";
import type { KalkulationStateContext } from "./useKalkulationState";

export function TenderPricing({ state }: { state: KalkulationStateContext }) {
  const {
    base,
    contribution,
    contributionMargin,
    costingMonthlyHours,
    discountAmountInput,
    discountFixed,
    discountPercent,
    discountReason,
    discountTotal,
    economyLevel,
    effectiveSellingRate,
    extrasTotal,
    grossTotal,
    laborBurdenPerHour,
    laborBurdenPercent,
    laborWage,
    glassGrossWage,
    setGlassGrossWage,
    lvPositions,
    lvTotal,
    materialCost,
    mode,
    type,
    area,
    hours,
    setMode,
    setType,
    setHours,
    hourlyRate,
    roomCalculation,
    monthlySelfCost,
    navigate,
    overheadCost,
    pct,
    profitMarkup,
    profitabilityRevenue,
    selfCostPerHour,
    setConfirmed,
    setDiscountAmountInput,
    setDiscountPercent,
    setDiscountReason,
    setHourlyRate,
    setTaxMode,
    stairs,
    stairsTotal,
    subtotal,
    suggested,
    targetMonthlyRevenue,
    targetSellingRate,
    taxMode,
    taxNote,
    travel,
    vatAmount,
    vatRate,
    warnings,
  } = state;
  const [productivityInput, setProductivityInput] = useState("120");
  const [workerInput, setWorkerInput] = useState("1");
  const [stairEntrances, setStairEntrances] = useState("1");
  const [stairFloors, setStairFloors] = useState("3");
  const [stairMinutesPerFloor, setStairMinutesPerFloor] = useState("8");
  const [stairEntranceSize, setStairEntranceSize] = useState("normal");
  const [stairEntranceMinutes, setStairEntranceMinutes] = useState("10");
  const [stairManualMinutes, setStairManualMinutes] = useState("");
  const isGlass = type === "glas";
  const [glassWindows, setGlassWindows] = useState("10");
  const [glassSize, setGlassSize] = useState("normal");
  const [glassSides, setGlassSides] = useState("2");
  const [glassFrames, setGlassFrames] = useState(false);
  const [glassAccess, setGlassAccess] = useState("normal");
  const [glassMinutesPerWindow, setGlassMinutesPerWindow] = useState("5");
  const [glassManualMinutes, setGlassManualMinutes] = useState("");
  const glassSizeFactor = glassSize === "small" ? 0.7 : glassSize === "large" ? 1.5 : 1;
  const glassAccessFactor = glassAccess === "difficult" ? 1.5 : 1;
  const glassSuggestedMinutes = num(glassWindows) * num(glassMinutesPerWindow) *
    glassSizeFactor * (num(glassSides) === 2 ? 2 : 1) * glassAccessFactor +
    (glassFrames ? num(glassWindows) * 2 : 0);
  const glassTotalMinutes = glassManualMinutes.trim() ? num(glassManualMinutes) : glassSuggestedMinutes;
  const glassHours = glassTotalMinutes / 60;
  const glassValid = Number.isInteger(num(glassWindows)) && num(glassWindows) >= 1 && num(glassWindows) <= 10000 &&
    (num(glassSides) === 1 || num(glassSides) === 2) && num(glassMinutesPerWindow) > 0 &&
    glassTotalMinutes > 0 && num(glassGrossWage) > 0;
  // The central cost engine is the only source of truth for glass labor costs.
  const glassEmployerHourly = num(glassGrossWage) + laborBurdenPerHour;
  const glassSelfCostHourly = selfCostPerHour;
  const glassTargetHourly = targetSellingRate;
  const isStaircase = type === "treppenhaus";
  const entranceFactor = stairEntranceSize === "small" ? 0.75 : stairEntranceSize === "large" ? 1.5 : 1;
  const stairSuggestedMinutes = num(stairEntrances) * (num(stairFloors) * num(stairMinutesPerFloor) + num(stairEntranceMinutes) * entranceFactor);
  const stairTotalMinutes = stairManualMinutes.trim() ? num(stairManualMinutes) : stairSuggestedMinutes;
  const stairValid = Number.isInteger(num(stairEntrances)) && num(stairEntrances) >= 1 && num(stairEntrances) <= 100 &&
    Number.isInteger(num(stairFloors)) && num(stairFloors) >= 1 && num(stairFloors) <= 100 &&
    num(stairMinutesPerFloor) > 0 && num(stairEntranceMinutes) >= 0 && stairTotalMinutes > 0;
  const stairLaborHours = stairTotalMinutes / 60;
  const [trainingRate, setTrainingRate] = useState<{ rate: number; count: number } | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const cleaningType = state.selected.label;
  useEffect(() => {
    let active = true;
    setTrainingRate(null);
    setTrainingLoading(true);
    const load = async () => {
      try {
        const uid = await requireUserId();
        const { data, error } = await supabase.from("ki_training_experiences")
          .select("cleaning_type,area_sqm,actual_labor_hours")
          .eq("user_id", uid)
          .eq("cleaning_type", cleaningType)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const valid = (data ?? []).filter((row) =>
          Number(row.area_sqm) > 0 && Number(row.actual_labor_hours) > 0 &&
          Number.isFinite(Number(row.area_sqm)) && Number.isFinite(Number(row.actual_labor_hours)));
        const totalHours = valid.reduce((sum, row) => sum + Number(row.actual_labor_hours), 0);
        const totalArea = valid.reduce((sum, row) => sum + Number(row.area_sqm), 0);
        if (active) setTrainingRate(valid.length >= 2 && totalHours > 0
          ? { rate: totalArea / totalHours, count: valid.length } : null);
      } catch {
        if (active) setTrainingRate(null);
      } finally {
        if (active) setTrainingLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [cleaningType]);
  const productivity = num(productivityInput);
  const workers = num(workerInput);
  const estimatedLaborHours = productivity > 0 ? num(area) / productivity : 0;
  const estimatedElapsedHours = workers > 0 ? estimatedLaborHours / workers : 0;
  const validEstimate = num(area) > 0 && productivity > 0 && Number.isInteger(workers) && workers >= 1 && workers <= 100;
  const previewCleaningHours = mode === "hours" ? num(hours) : estimatedLaborHours;
  const previewAvailable = mode === "hours" && !roomCalculation.enabled && lvPositions.length === 0 && previewCleaningHours > 0;
  const previewMinimum = previewCleaningHours * selfCostPerHour;
  const previewRecommended = previewCleaningHours * targetSellingRate;
  const previewCustomer = subtotal;
  const previewDifference = previewCustomer - previewMinimum;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Berechnung</CardTitle>
        <CardDescription>Automatische Vorab-Berechnung und freier Endpreis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <details open className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Schnellkalkulation nach Reinigungsart</summary>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">Reinigungsart wählen; Ihre eigenen Kosten und Stundensätze bleiben maßgeblich.</p>
            <div className="flex flex-wrap gap-2">
              {CLEANING_TYPES.map((service) => (
                <Button key={service.value} type="button" size="sm" variant={type === service.value ? "default" : "outline"} onClick={() => { setType(service.value); setConfirmed(false); }}>
                  {service.label}
                </Button>
              ))}
            </div>
            <p>{isStaircase ? "Treppenhaus: Berechnung nach Etagen und Arbeitszeit (ohne Pflichtfläche)." : `Fläche: ${formatNumber(num(area))} m²`} · Reinigungszeit: {formatNumber(num(hours))} Std.</p>
            <p>Selbstkosten: {formatMoney(selfCostPerHour)} / Std. · Zielpreis: {formatMoney(targetSellingRate)} / Std.</p>
            {!isStaircase && <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("hours")}>Nach Stunden</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("area")}>Nach Fläche</Button>
            </div>}
            {!isStaircase && !isGlass && <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="productivity-sqm">Leistung (m² je Mitarbeiterstunde)</Label><Input id="productivity-sqm" inputMode="decimal" value={productivityInput} onChange={(e) => setProductivityInput(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="productivity-workers">Anzahl Mitarbeiter</Label><Input id="productivity-workers" inputMode="numeric" value={workerInput} onChange={(e) => setWorkerInput(e.target.value)} /></div>
            </div>}
            {isGlass && <div className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Glas- und Fensterreinigung: Zeit- und Lohnkalkulation</p>
              <p className="text-xs text-muted-foreground">Beispielminuten, keine geprüften Leistungswerte. Glasfläche kann für Ausschreibungen weiterhin separat nach m² kalkuliert werden.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="glass-count">Anzahl Fenster</Label><Input id="glass-count" inputMode="numeric" value={glassWindows} onChange={(e) => setGlassWindows(e.target.value)} /></div>
                <div><Label htmlFor="glass-size">Fenstergröße</Label><Select value={glassSize} onValueChange={setGlassSize}><SelectTrigger id="glass-size"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Klein</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Groß</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="glass-sides">Reinigungsseiten</Label><Select value={glassSides} onValueChange={setGlassSides}><SelectTrigger id="glass-sides"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Einseitig</SelectItem><SelectItem value="2">Beidseitig</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="glass-access">Zugänglichkeit</Label><Select value={glassAccess} onValueChange={setGlassAccess}><SelectTrigger id="glass-access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="difficult">Erschwert</SelectItem></SelectContent></Select></div>
                <div className="flex items-center gap-2"><input id="glass-frames" type="checkbox" checked={glassFrames} onChange={(e) => setGlassFrames(e.target.checked)} /><Label htmlFor="glass-frames">Rahmen reinigen (+2 Min. je Fenster)</Label></div>
                <div><Label htmlFor="glass-minutes">Minuten je Fensterseite (normal)</Label><Input id="glass-minutes" inputMode="decimal" value={glassMinutesPerWindow} onChange={(e) => setGlassMinutesPerWindow(e.target.value)} /></div>
                <div><Label htmlFor="glass-manual">Gesamtminuten manuell (optional)</Label><Input id="glass-manual" inputMode="decimal" placeholder="Leer = Vorschlag" value={glassManualMinutes} onChange={(e) => setGlassManualMinutes(e.target.value)} /></div>
                <div><Label htmlFor="glass-wage">Bruttolohn Glasreinigung (€ / Std.)</Label><Input id="glass-wage" inputMode="decimal" value={glassGrossWage} onChange={(e) => setGlassGrossWage(e.target.value)} /></div>
              </div>
              {glassValid ? <>
                <p>Vorschlag: {formatNumber(glassSuggestedMinutes)} Min. · Arbeitszeit: <strong>{formatNumber(glassHours)} Std. je Einsatz</strong></p>
                <p>Bruttolohn: {formatMoney(num(glassGrossWage))}/Std. · Arbeitgeberkosten: {formatMoney(glassEmployerHourly)}/Std. · Selbstkosten inkl. Material/Gemeinkosten: {formatMoney(glassSelfCostHourly)}/Std.</p>
                <p>Geschätzte Selbstkosten: <strong>{formatMoney(glassHours * glassSelfCostHourly)}</strong> · Zielpreis: <strong>{formatMoney(glassHours * glassTargetHourly)}</strong></p>
                <Button type="button" size="sm" variant="outline" disabled={!glassValid || roomCalculation.enabled || lvPositions.length > 0} onClick={() => { setMode("hours"); setHours(String(Math.round(glassHours * 100) / 100).replace(".", ",")); setConfirmed(false); }}>Arbeitszeit übernehmen (Nach Stunden)</Button>
                <p className="text-xs text-muted-foreground">Nur die Arbeitszeit wird übernommen. Der Glas-Bruttolohn von {formatMoney(num(glassGrossWage))}/Std. fließt in die zentrale Selbstkosten- und Rentabilitätsrechnung ein. Der Angebotspreis und LV-Positionen ändern sich nicht automatisch; bitte vor Abgabe prüfen.</p>
              </> : <p className="text-destructive">Bitte gültige Fensterzahl, Minuten und Bruttolohn eingeben.</p>}
            </div>}
            {isStaircase && <div className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Treppenhaus: Zeitkalkulation je Einsatz</p>
              <p className="text-xs text-muted-foreground">Die Minuten sind editierbare Beispiele, keine geprüften Leistungswerte. Alle Etagenangaben gelten pro Eingang.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="stair-entrances">Anzahl Hauseingänge</Label><Input id="stair-entrances" inputMode="numeric" value={stairEntrances} onChange={(e) => setStairEntrances(e.target.value)} /></div>
                <div><Label htmlFor="stair-floors">Etagen pro Eingang</Label><Input id="stair-floors" inputMode="numeric" value={stairFloors} onChange={(e) => setStairFloors(e.target.value)} /></div>
                <div><Label htmlFor="stair-min-floor">Minuten pro Etage</Label><Input id="stair-min-floor" inputMode="decimal" value={stairMinutesPerFloor} onChange={(e) => setStairMinutesPerFloor(e.target.value)} /></div>
                <div><Label htmlFor="stair-entrance-size">Größe Eingangsbereich</Label><Select value={stairEntranceSize} onValueChange={setStairEntranceSize}><SelectTrigger id="stair-entrance-size"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Klein</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Groß</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="stair-entrance-min">Minuten je Eingang (normal)</Label><Input id="stair-entrance-min" inputMode="decimal" value={stairEntranceMinutes} onChange={(e) => setStairEntranceMinutes(e.target.value)} /></div>
                <div><Label htmlFor="stair-manual-min">Gesamtminuten manuell (optional)</Label><Input id="stair-manual-min" inputMode="decimal" placeholder="Leer = Vorschlag" value={stairManualMinutes} onChange={(e) => setStairManualMinutes(e.target.value)} /></div>
              </div>
              {stairValid ? <><p>Vorschlag: {formatNumber(stairSuggestedMinutes)} Min. · Arbeitszeit: <strong>{formatNumber(stairLaborHours)} Std. je Einsatz</strong></p><p>Geschätzte Kosten: {formatMoney(stairLaborHours * selfCostPerHour)} · Zielpreis: {formatMoney(stairLaborHours * targetSellingRate)}</p><Button type="button" size="sm" variant="outline" disabled={roomCalculation.enabled || lvPositions.length > 0} onClick={() => { setMode("hours"); setHours(String(Math.round(stairLaborHours * 100) / 100).replace(".", ",")); setConfirmed(false); }}>Arbeitszeit übernehmen (Nach Stunden)</Button>{(roomCalculation.enabled || lvPositions.length > 0) && <p className="text-xs text-muted-foreground">Übernahme gesperrt, solange Raumkalkulation oder LV-Positionen aktiv sind.</p>}</> : <p className="text-destructive">Bitte gültige Eingänge, Etagen und Minuten eingeben.</p>}
            </div>}
            {!isStaircase && !isGlass && (validEstimate ? (
              <div className="rounded-md border p-2">
                <p>Geschätzte Arbeitsstunden gesamt: <strong>{formatNumber(estimatedLaborHours)} Std. / Einsatz</strong></p>
                <p>Dauer vor Ort mit {workers} Mitarbeiter(n): <strong>{formatNumber(estimatedElapsedHours)} Std.</strong></p>
                <p>Geschätzte Personalkosten inkl. Zuschläge und Gemeinkosten: <strong>{formatMoney(estimatedLaborHours * (num(laborWage) + laborBurdenPerHour + num(overheadCost)))}</strong></p>
                {mode === "hours" && !roomCalculation.enabled && lvPositions.length === 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => { setHours(String(Math.round(estimatedLaborHours * 100) / 100).replace(".", ",")); setConfirmed(false); }}>
                    Arbeitsstunden übernehmen
                  </Button>
                )}
              </div>
            ) : <p className="text-xs text-destructive">Bitte gültige Fläche, Leistung und Mitarbeiterzahl (1–100) eingeben.</p>)}
            {!isStaircase && !isGlass && <div className="rounded-md border p-3 text-sm space-y-2">
              <p className="font-medium">KI-Training: Erfahrungswert für {cleaningType}</p>
              {trainingLoading ? <p className="text-muted-foreground">Erfahrungswerte werden geprüft…</p> : trainingRate ? (
                <>
                  <p>Aus {trainingRate.count} gespeicherten Einsätzen: {formatNumber(trainingRate.rate)} m² je Mitarbeiterstunde (Orientierungswert).</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    setProductivityInput(String(Math.round(trainingRate.rate * 100) / 100).replace(".", ","));
                    setConfirmed(false);
                  }}>Erfahrungswert übernehmen</Button>
                  <p className="text-xs text-muted-foreground">Nur die Leistungseingabe wird auf Ihren Klick geändert. Stunden, Preise und LV bleiben unverändert. Bitte nur echte, vergleichbare Einsätze speichern.</p>
                </>
              ) : <p className="text-muted-foreground">Noch nicht genügend vergleichbare Cloud-Daten (mindestens 2 echte Einsätze nötig). Der Beispielwert bleibt unverändert.</p>}
            </div>}
            {!isStaircase && !isGlass && <p className="text-xs text-muted-foreground">120 m²/Std. ist nur ein editierbarer Beispielwert, kein geprüfter Leistungswert für diese Reinigungsart. Mitarbeiterzahl verkürzt die Einsatzdauer, nicht die bezahlten Gesamtstunden. Bitte tatsächliche Leistungswerte prüfen; keine automatische Angebotsübernahme.</p>}
            <p className="text-xs text-muted-foreground">Bitte Zeit, Fläche und Preise prüfen. Keine automatische Angebotsübernahme.</p>
          </div>
        </details>
        {previewAvailable && (
          <div className="rounded-md border p-3 space-y-2 text-sm">
            <p className="font-medium">Preisübersicht pro Einsatz (netto)</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Mindestpreis (Kosten)</p><strong>{formatMoney(previewMinimum)}</strong></div>
              <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Empfohlener Preis (Ziel)</p><strong>{formatMoney(previewRecommended)}</strong></div>
              <div className="rounded bg-muted/40 p-2"><p className="text-xs text-muted-foreground">Kundenpreis (aktuell)</p><strong>{formatMoney(previewCustomer)}</strong></div>
            </div>
            <p className={previewDifference < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>Differenz zum Mindestpreis: {formatMoney(previewDifference)} {previewDifference < 0 ? "– unter Kosten!" : "– vor weiteren nicht erfassten Kosten"}</p>
            <p className="text-xs text-muted-foreground">Orientierung anhand der aktuell übernommenen Arbeitsstunden und Kosten pro Reinigungsstunde. Anfahrt und Zusatzleistungen sind im aktuellen Kundenpreis enthalten, aber zusätzliche bezahlte Fahr- und Rüstzeiten müssen separat geprüft werden. Kein automatisches Speichern oder Ändern von Angeboten.</p>
          </div>
        )}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Grundleistung</span>
            <span>{formatMoney(base)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zusatzoptionen</span>
            <span>{formatMoney(extrasTotal)}</span>
          </div>
          {stairs && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treppenhausreinigung</span>
              <span>{formatMoney(stairsTotal)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Anfahrt</span>
            <span>{formatMoney(num(travel))}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>Zwischensumme (netto)</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
        </div>

        <details className="group rounded-md border">
          <summary className="cursor-pointer list-none p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Kosten & Wirtschaftlichkeit</p>
                <p className="text-xs text-muted-foreground">
                  Selbstkosten {formatMoney(selfCostPerHour)} / Std. · Ziel{" "}
                  {formatMoney(targetSellingRate)} / Std.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    economyLevel === "good"
                      ? "font-medium text-emerald-700 dark:text-emerald-300"
                      : economyLevel === "tight"
                        ? "font-medium text-amber-700 dark:text-amber-300"
                        : "font-medium text-red-700 dark:text-red-300"
                  }
                >
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend"
                      : "Nicht kostendeckend"}
                </span>
                <span className="text-primary group-open:hidden">Details</span>
                <span className="hidden text-primary group-open:inline">Schließen</span>
              </div>
            </div>
          </summary>

          <div className="space-y-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              Erlösbasis: {lvPositions.length > 0 ? "LV-Endsumme (netto)" : "Kalkulationsvorschlag (netto)"} · {formatMoney(profitabilityRevenue)}. Die Deckungsbeitragsrechnung setzt voraus, dass Erlös und Selbstkosten denselben Abrechnungszeitraum betreffen; bei einmaligen LV-Positionen bitte separat prüfen.
            </p>
            <p className="text-xs text-muted-foreground">
              Kostenbasis und Leistungswerte werden zentral unter Einstellungen →
              Kalkulationsgrundlagen gepflegt. Hier werden sie nur zur Kalkulation angezeigt.
            </p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohn brutto / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(laborWage))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Lohnnebenkosten</p>
                <p className="text-sm font-medium">
                  {formatNumber(num(laborBurdenPercent))} % · {formatMoney(laborBurdenPerHour)}
                </p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Material / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(materialCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gemeinkosten / Std.</p>
                <p className="text-sm font-medium">{formatMoney(num(overheadCost))}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[11px] text-muted-foreground">Gewinnaufschlag</p>
                <p className="text-sm font-medium">{formatNumber(num(profitMarkup))} %</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Selbstkosten / Std.</p>
                <p className="font-semibold">{formatMoney(selfCostPerHour)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Ziel-Verkaufspreis / Std.</p>
                <p className="font-semibold">{formatMoney(targetSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Effektiver Erlös / Std.</p>
                <p className="font-semibold">{formatMoney(effectiveSellingRate)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Deckungsbeitrag / Monat</p>
                <p className="font-semibold">{formatMoney(contribution)}</p>
              </div>
            </div>

            <div
              className={
                economyLevel === "good"
                  ? "rounded-md border border-emerald-500/60 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : economyLevel === "tight"
                    ? "rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                    : "rounded-md border border-red-500/60 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-200"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>
                  {economyLevel === "good"
                    ? "Wirtschaftlich"
                    : economyLevel === "tight"
                      ? "Kostendeckend, aber unter Zielmarge"
                      : "Nicht kostendeckend"}
                </strong>
                <span>
                  Marge {formatNumber(contributionMargin)} % · {formatNumber(costingMonthlyHours)}{" "}
                  Std./Monat
                </span>
              </div>
              <p className="mt-1 text-xs opacity-80">
                Monatliche Selbstkosten {formatMoney(monthlySelfCost)} · Zielumsatz bei gewünschter
                Marge {formatMoney(targetMonthlyRevenue)}
              </p>
            </div>

            <NonproductiveTimePanel
              cleaningHoursPerMonth={costingMonthlyHours}
              sellingRatePerPaidHour={mode === "hours" ? num(hourlyRate) : effectiveSellingRate}
              onApplyCustomerRate={mode === "hours" && !roomCalculation.enabled && lvPositions.length === 0 ? (rate) => {
                setHourlyRate(String(rate).replace(".", ","));
                setConfirmed(false);
              } : undefined}
              laborCostPerHour={num(laborWage) + laborBurdenPerHour}
              materialCostPerHour={num(materialCost)}
              overheadCostPerHour={num(overheadCost)}
              profitMarkupPercent={num(profitMarkup)}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/einstellungen" })}
              >
                Kostenbasis & Leistungswerte ändern
              </Button>
              {mode === "hours" && targetSellingRate > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHourlyRate(String(targetSellingRate).replace(".", ","))}
                >
                  Ziel-Stundensatz übernehmen
                </Button>
              ) : null}
            </div>
          </div>
        </details>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Rabatt (%)</Label>
            <Input
              inputMode="decimal"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rabatt (fester Betrag netto)</Label>
            <Input
              inputMode="decimal"
              value={discountAmountInput}
              onChange={(e) => setDiscountAmountInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rabattgrund</Label>
            <Input
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="z. B. Treuerabatt"
            />
          </div>
        </div>

        {discountTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Rabatt{pct > 0 ? ` ${formatNumber(pct)} %` : ""}
              {discountFixed > 0 ? ` + ${formatMoney(discountFixed)}` : ""}
              {discountReason ? ` – ${discountReason}` : ""}
            </span>
            <span>−{formatMoney(discountTotal)}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label>Steuerart</Label>
          <Select value={taxMode} onValueChange={setTaxMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="domestic">Inland – 19 % USt.</SelectItem>
              <SelectItem value="eu_reverse_charge">EU-Ausland – Reverse-Charge (0 %)</SelectItem>
              <SelectItem value="kleinunternehmer">Kleinunternehmer § 19 UStG (0 %)</SelectItem>
            </SelectContent>
          </Select>
          {taxNote ? <p className="text-xs text-muted-foreground">{taxNote}</p> : null}
        </div>

        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex justify-between font-medium">
            <span>Vorschlag Grundkalkulation (netto)</span>
            <span>{formatMoney(suggested)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Quelle: Grundkalkulation (primär für Ausschreibungen/LV). Über „Grundkalkulation für
            Angebot übernehmen“ werden diese Werte als Positionen in das Leistungsverzeichnis
            geschrieben. Maßgeblich für Angebot und PDF ist immer die Summe der LV-Positionen.
          </p>
        </div>

        <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Positionen im Leistungsverzeichnis</span>
            <span>{lvPositions.length}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-medium">
            <span>Gesamt netto</span>
            <span>{formatMoney(lvTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{vatRate > 0 ? `zzgl. ${formatNumber(vatRate)} % MwSt.` : "Umsatzsteuer"}</span>
            <span>{formatMoney(vatAmount)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>{vatRate > 0 ? "Gesamt brutto" : "Gesamtbetrag"}</span>
            <span>{formatMoney(grossTotal)}</span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            Die Gesamtsumme ergibt sich ausschließlich aus Menge × Einzelpreis der LV-Positionen –
            ohne stille Ausgleichsposition.
          </p>
        </div>

        {warnings.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Bitte Angaben prüfen</p>
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
