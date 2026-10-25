import { useState } from "react";
import { formatMoney, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "./shared";
import { findCleaningTypeRate } from "@/lib/leistungswerte";
import type { KalkulationStateContext } from "./useKalkulationState";

export function StaircaseCalculationPanel({ state }: { state: KalkulationStateContext }) {
  const { selfCostPerHour, targetSellingRate, roomCalculation, lvPositions,
    setMode, setHours, setConfirmed } = state;
  const savedStairRate = findCleaningTypeRate(state.visiblePerformanceRates, "treppenhaus", "Treppenhausreinigung");
  const [stairArea, setStairArea] = useState("");
  const [stairEntrances, setStairEntrances] = useState("1");
  const [stairFloors, setStairFloors] = useState("3");
  const [stairMinutesPerFloor, setStairMinutesPerFloor] = useState("8");
  const [stairEntranceSize, setStairEntranceSize] = useState("normal");
  const [stairEntranceMinutes, setStairEntranceMinutes] = useState("10");
  const [stairManualMinutes, setStairManualMinutes] = useState("");
  const entranceFactor = stairEntranceSize === "small" ? 0.75 : stairEntranceSize === "large" ? 1.5 : 1;
  const stairSuggestedMinutes = num(stairEntrances) * (num(stairFloors) * num(stairMinutesPerFloor) + num(stairEntranceMinutes) * entranceFactor);
  const areaMinutes = savedStairRate && num(stairArea) > 0 ? num(stairArea) / savedStairRate.sqm_per_hour * 60 : null;
  const stairTotalMinutes = stairManualMinutes.trim() ? num(stairManualMinutes) : areaMinutes ?? stairSuggestedMinutes;
  const stairValid = Number.isInteger(num(stairEntrances)) && num(stairEntrances) >= 1 && num(stairEntrances) <= 100 &&
    Number.isInteger(num(stairFloors)) && num(stairFloors) >= 1 && num(stairFloors) <= 100 &&
    num(stairMinutesPerFloor) > 0 && num(stairEntranceMinutes) >= 0 && stairTotalMinutes > 0;
  const stairLaborHours = stairTotalMinutes / 60;
  return (
            <div className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Treppenhaus: Zeitkalkulation je Einsatz</p>
              <p className="text-xs text-muted-foreground">Die Minuten sind editierbare Beispiele, keine geprüften Leistungswerte. Alle Etagenangaben gelten pro Eingang.</p>
              <p className="text-xs text-muted-foreground">Leistungswert: {savedStairRate ? `${formatNumber(savedStairRate.sqm_per_hour)} m²/Std.` : "Nicht hinterlegt; Etagenberechnung weiterhin verfügbar."}</p>
              <div><Label htmlFor="stair-area">Treppenhausfläche (m², optional)</Label><Input id="stair-area" inputMode="decimal" value={stairArea} onChange={e => setStairArea(e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="stair-entrances">Anzahl Hauseingänge</Label><Input id="stair-entrances" inputMode="numeric" value={stairEntrances} onChange={(e) => setStairEntrances(e.target.value)} /></div>
                <div><Label htmlFor="stair-floors">Etagen pro Eingang</Label><Input id="stair-floors" inputMode="numeric" value={stairFloors} onChange={(e) => setStairFloors(e.target.value)} /></div>
                <div><Label htmlFor="stair-min-floor">Minuten pro Etage</Label><Input id="stair-min-floor" inputMode="decimal" value={stairMinutesPerFloor} onChange={(e) => setStairMinutesPerFloor(e.target.value)} /></div>
                <div><Label htmlFor="stair-entrance-size">Größe Eingangsbereich</Label><Select value={stairEntranceSize} onValueChange={setStairEntranceSize}><SelectTrigger id="stair-entrance-size"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Klein</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Groß</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="stair-entrance-min">Minuten je Eingang (normal)</Label><Input id="stair-entrance-min" inputMode="decimal" value={stairEntranceMinutes} onChange={(e) => setStairEntranceMinutes(e.target.value)} /></div>
                <div><Label htmlFor="stair-manual-min">Gesamtminuten manuell (optional)</Label><Input id="stair-manual-min" inputMode="decimal" placeholder="Leer = Vorschlag" value={stairManualMinutes} onChange={(e) => setStairManualMinutes(e.target.value)} /></div>
              </div>
              {stairValid ? <><p>Vorschlag: {formatNumber(areaMinutes ?? stairSuggestedMinutes)} Min. · Arbeitszeit: <strong>{formatNumber(stairLaborHours)} Std. je Einsatz</strong></p><p>Geschätzte Kosten: {formatMoney(stairLaborHours * selfCostPerHour)} · Zielpreis: {formatMoney(stairLaborHours * targetSellingRate)}</p><Button type="button" size="sm" variant="outline" disabled={roomCalculation.enabled || lvPositions.length > 0} onClick={() => { setMode("hours"); setHours(String(Math.round(stairLaborHours * 100) / 100).replace(".", ",")); setConfirmed(false); }}>Arbeitszeit übernehmen (Nach Stunden)</Button>{(roomCalculation.enabled || lvPositions.length > 0) && <p className="text-xs text-muted-foreground">Übernahme gesperrt, solange Raumkalkulation oder LV-Positionen aktiv sind.</p>}</> : <p className="text-destructive">Bitte gültige Eingänge, Etagen und Minuten eingeben.</p>}
            </div>
  );
}
