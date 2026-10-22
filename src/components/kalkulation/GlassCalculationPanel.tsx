import { useState } from "react";
import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "./shared";
import type { KalkulationStateContext } from "./useKalkulationState";

export function GlassCalculationPanel({ state }: { state: KalkulationStateContext }) {
  const { glassGrossWage, setGlassGrossWage, laborBurdenPerHour, selfCostPerHour,
    targetSellingRate, roomCalculation, lvPositions, setMode, setHours, setConfirmed } = state;
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
  return (
            <div className="space-y-3 rounded-md border p-3">
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
            </div>
  );
}
