import { DiscountPanel } from "./DiscountPanel";
import { TaxModePanel } from "./TaxModePanel";
import { LvTotalsPanel } from "./LvTotalsPanel";
import { CostProfitabilityPanel } from "./CostProfitabilityPanel";
import { GlassCalculationPanel } from "./GlassCalculationPanel";
import { StaircaseCalculationPanel } from "./StaircaseCalculationPanel";
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
  const isGlass = type === "glas";
  const isStaircase = type === "treppenhaus";
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
            <div hidden={!isGlass}><GlassCalculationPanel state={state} /></div>
            <div hidden={!isStaircase}><StaircaseCalculationPanel state={state} /></div>
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

        <CostProfitabilityPanel state={state} />

        <DiscountPanel state={state} />
        <TaxModePanel state={state} />
        <LvTotalsPanel state={state} />
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
