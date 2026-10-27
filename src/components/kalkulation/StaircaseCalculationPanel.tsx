import { useEffect, useState } from "react";
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
  const stairArea = state.area;
  const [stairMethod, setStairMethod] = useState<"area" | "floors">("area");
  const [stairEntrances, setStairEntrances] = useState("1");
  const [stairFloors, setStairFloors] = useState("");
  const [stairMinutesPerFloor, setStairMinutesPerFloor] = useState("");
  useEffect(() => { if (savedStairRate?.minutes_per_floor && savedStairRate.minutes_per_floor > 0) setStairMinutesPerFloor(String(savedStairRate.minutes_per_floor)); }, [savedStairRate?.minutes_per_floor]);
  const [stairEntranceSize, setStairEntranceSize] = useState("normal");
  const [stairEntranceMinutes, setStairEntranceMinutes] = useState("0");
  const [stairManualMinutes, setStairManualMinutes] = useState("");
  const entranceFactor = stairEntranceSize === "small" ? 0.75 : stairEntranceSize === "large" ? 1.5 : 1;
  const stairSuggestedMinutes = num(stairFloors) * num(stairMinutesPerFloor) + num(stairEntrances) * num(stairEntranceMinutes) * entranceFactor;
  const areaMinutes = savedStairRate && num(stairArea) > 0 ? num(stairArea) / savedStairRate.sqm_per_hour * 60 : null;
  const stairTotalMinutes = stairMethod === "area" ? (areaMinutes ?? 0) : (stairManualMinutes.trim() ? num(stairManualMinutes) : stairSuggestedMinutes);
  const stairValid = (stairMethod === "area" ? areaMinutes !== null && areaMinutes > 0 : true) && (stairMethod === "area" || (Number.isInteger(num(stairEntrances)) && num(stairEntrances) >= 1 && num(stairEntrances) <= 100 &&
    Number.isInteger(num(stairFloors)) && num(stairFloors) >= 1 && num(stairFloors) <= 100 &&
    num(stairMinutesPerFloor) > 0 && num(stairEntranceMinutes) >= 0)) && stairTotalMinutes > 0;
  const stairLaborHours = stairTotalMinutes / 60;
  useEffect(() => {
    if (state.type !== "treppenhaus" || stairMethod !== "floors" || roomCalculation.enabled || lvPositions.length > 0) return;
    setMode("hours");
    setHours(stairValid ? String(stairLaborHours).replace(".", ",") : "");
    setConfirmed(false);
  }, [state.type, stairMethod, roomCalculation.enabled, lvPositions.length, stairValid, stairLaborHours, setMode, setHours, setConfirmed]);
  return (
            <div className="space-y-3 rounded-md border p-3">
              <p className="font-medium">Treppenhaus: Zeitkalkulation je Einsatz</p>
              <p className="text-xs text-muted-foreground">Fläche ÷ gespeicherter Leistungswert berechnet die Arbeitszeit automatisch. Alternativ Etagen und gespeicherte Minuten je Etage verwenden.</p>
              <p className="text-xs text-muted-foreground">Leistungswert: {savedStairRate ? `${formatNumber(savedStairRate.sqm_per_hour)} m²/Std.` : "Nicht hinterlegt; Etagenberechnung weiterhin verfügbar."}</p>
              <div><Label htmlFor="stair-method">Zeitberechnung Treppenhaus</Label><Select value={stairMethod} onValueChange={value => {
                setStairMethod(value as "area" | "floors");
                if (value === "area" && !roomCalculation.enabled && lvPositions.length === 0) setMode("area");
              }}><SelectTrigger id="stair-method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="area">Nach Fläche (m²)</SelectItem><SelectItem value="floors">Nach Etagen</SelectItem></SelectContent></Select></div>
              {stairMethod === "area" && <div><Label htmlFor="stair-area">Treppenhausfläche (m²)</Label><Input id="stair-area" inputMode="decimal" placeholder="Treppenhausfläche eingeben" value={stairArea} disabled={roomCalculation.enabled || lvPositions.length > 0} onChange={e => { state.setArea(e.target.value); setMode("area"); }} /></div>}
              {stairMethod === "floors" && <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="stair-entrances">Anzahl Hauseingänge</Label><Input id="stair-entrances" inputMode="numeric" value={stairEntrances} onChange={(e) => setStairEntrances(e.target.value)} /></div>
                <div><Label htmlFor="stair-floors">Anzahl Etagen im Gebäude</Label><Input id="stair-floors" inputMode="numeric" aria-describedby="stair-floors-help" value={stairFloors} onChange={(e) => setStairFloors(e.target.value)} /><p id="stair-floors-help" className="text-xs text-muted-foreground">Zu reinigende Etagen insgesamt angeben. Die Zeit für Eingangsbereiche wird separat addiert.</p></div>
                <div><Label htmlFor="stair-min-floor">Minuten pro Etage</Label><Input id="stair-min-floor" inputMode="decimal" value={stairMinutesPerFloor} onChange={(e) => setStairMinutesPerFloor(e.target.value)} /></div>
                <div><Label htmlFor="stair-entrance-size">Größe Eingangsbereich</Label><Select value={stairEntranceSize} onValueChange={setStairEntranceSize}><SelectTrigger id="stair-entrance-size"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">Klein</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Groß</SelectItem></SelectContent></Select></div>
                <div><Label htmlFor="stair-entrance-min">Minuten je Eingang (normal)</Label><Input id="stair-entrance-min" inputMode="decimal" value={stairEntranceMinutes} onChange={(e) => setStairEntranceMinutes(e.target.value)} /></div>
                <div><Label htmlFor="stair-manual-min">Gesamtminuten manuell (optional)</Label><Input id="stair-manual-min" inputMode="decimal" placeholder="Leer = Vorschlag" value={stairManualMinutes} onChange={(e) => setStairManualMinutes(e.target.value)} /></div>
              </div>}
              {stairMethod === "floors" && <p className="text-xs text-muted-foreground">Gespeicherte Minuten je Etage werden vorbelegt. Änderungen berechnen die Arbeitszeit automatisch neu.</p>}
              {stairValid ? <><p>Vorschlag: {formatNumber(stairMethod === "area" ? (areaMinutes ?? 0) : stairSuggestedMinutes)} Min. · Arbeitszeit: <strong>{formatNumber(stairLaborHours)} Std. je Einsatz</strong></p><p>Geschätzte Kosten: {formatMoney(stairLaborHours * selfCostPerHour)} · Zielpreis: {formatMoney(stairLaborHours * targetSellingRate)}</p>{(roomCalculation.enabled || lvPositions.length > 0) && <p className="text-xs text-muted-foreground">Übernahme gesperrt, solange Raumkalkulation oder LV-Positionen aktiv sind.</p>}</> : <p className="text-destructive">Bitte gültige Eingänge, Etagen und Minuten eingeben.</p>}
            </div>
  );
}
