import { useEffect, useState } from "react";
import { cleaningHoursPerVisit } from "@/lib/cleaning-hours";
import { formatMoney, formatNumber } from "@/lib/format";
import { CleaningPriceSummary } from "./CleaningPriceSummary";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function GlassCalculationPanel({ state }: { state: KalkulationStateContext }) {
  const { glassGrossWage, setGlassGrossWage, laborBurdenPerHour, selfCostPerHour,
    roomCalculation, lvPositions, setMode, setHours, setConfirmed } = state;
  const [glassMethod, setGlassMethod] = useState<"area" | "windows">("area");
  const [glassWindows, setGlassWindows] = useState("");
  const [glassSize, setGlassSize] = useState("normal");
  const [glassSides, setGlassSides] = useState("2");
  const [glassFrames, setGlassFrames] = useState(false);
  const [glassAccess, setGlassAccess] = useState("normal");
  const [glassMinutesPerWindow, setGlassMinutesPerWindow] = useState("");
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
  const areaHours = cleaningHoursPerVisit({ mode: "area", typeValue: "glas", area: 0, glassArea: num(state.glassArea), hours: 0, sqmPerHour: Number(state.selectedPerformanceRate?.sqm_per_hour ?? 0) });
  useEffect(() => {
    if (state.type !== "glas" || glassMethod !== "windows" || roomCalculation.enabled || lvPositions.length > 0) return;
    setMode("hours");
    setHours(glassValid ? String(glassHours).replace(".", ",") : "");
    setConfirmed(false);
  }, [state.type, glassMethod, roomCalculation.enabled, lvPositions.length, glassValid, glassHours, setMode, setHours, setConfirmed]);
  // The central cost engine is the only source of truth for glass labor costs.
  const glassEmployerHourly = num(glassGrossWage) + laborBurdenPerHour;
  const glassSelfCostHourly = selfCostPerHour;
  return (
            <div className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Glas- und Fensterreinigung: Zeit- und Lohnkalkulation</p>
              <div><Label htmlFor="glass-method">Zeitberechnung Glasreinigung</Label><Select value={glassMethod} onValueChange={value => {
                setGlassMethod(value as "area" | "windows");
                if (value === "area" && !roomCalculation.enabled && lvPositions.length === 0) setMode("area");
              }}><SelectTrigger id="glass-method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="area">Gespeicherter Leistungswert (m²/Std.)</SelectItem><SelectItem value="windows">Eigene Minuten je Fenster</SelectItem></SelectContent></Select></div>
              {glassMethod === "area" ? <>
                <div><Label htmlFor="glass-workload-area">Glasfläche für Zeitkalkulation (m²)</Label><Input id="glass-workload-area" inputMode="decimal" placeholder="Glasfläche eingeben" value={state.glassArea} disabled={roomCalculation.enabled || lvPositions.length > 0} onChange={e => { state.setGlassArea(e.target.value); setMode("area"); }} /></div>
                <p>Gespeicherter Leistungswert: {formatNumber(Number(state.selectedPerformanceRate?.sqm_per_hour ?? 0))} m²/Std.</p>
                {areaHours > 0 ? <><p>Arbeitszeit aus Leistungswert: <strong>{formatNumber(areaHours)} Std. je Einsatz</strong></p><CleaningPriceSummary hours={areaHours} state={state} /><p className="text-xs text-muted-foreground">Fläche und gespeicherter Leistungswert berechnen die Arbeitszeit automatisch. Den Stundensatz für den Angebotspreis bitte selbst eingeben.</p></> : <p className="text-xs text-muted-foreground">Bitte Glasfläche eingeben und einen gültigen Glas-Leistungswert in den Einstellungen hinterlegen.</p>}
              </> : <>
              <p className="text-xs text-muted-foreground">Eigene Minuten eingeben. Die Arbeitszeit wird automatisch in die Stundenkalkulation übernommen.</p>
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
                <CleaningPriceSummary hours={glassHours} state={state} />
                
                <p className="text-xs text-muted-foreground">Nur die Arbeitszeit wird übernommen. Der Glas-Bruttolohn von {formatMoney(num(glassGrossWage))}/Std. fließt in die zentrale Selbstkosten- und Rentabilitätsrechnung ein. Die Arbeitszeit und der aktuelle Kalkulationspreis werden automatisch aktualisiert. Bestehende LV-Positionen bleiben unverändert.</p>
              </> : <p className="text-destructive">Bitte gültige Fensterzahl, Minuten und Bruttolohn eingeben.</p>}
              </>}
            </div>
  );
}
