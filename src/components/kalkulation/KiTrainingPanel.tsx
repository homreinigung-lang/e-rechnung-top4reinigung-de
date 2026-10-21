import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { KalkulationStateContext } from "./useKalkulationState";

type Experience = { id: string; kind: string; area: number; expected: number; actual: number; savedAt: string };
const KEY = "gebcalc-ki-training-experiences-v1";

function loadExperiences(): Experience[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Experience =>
      typeof item === "object" && item !== null &&
      typeof item.id === "string" && typeof item.kind === "string" &&
      Number.isFinite(item.area) && Number.isFinite(item.expected) &&
      Number.isFinite(item.actual) && typeof item.savedAt === "string"
    ).slice(0, 100);
  } catch { return []; }
}

export function KiTrainingPanel({ state }: { state: KalkulationStateContext }) {
  const [entries, setEntries] = useState<Experience[]>([]);
  useEffect(() => { setEntries(loadExperiences()); }, []);
  const [actual, setActual] = useState("");
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const area = Number(state.area);
  const expected = Number(state.hours);
  const kind = state.selected.label;
  const similar = useMemo(() => entries.filter((e) => e.kind === kind && e.area > 0 && e.actual > 0), [entries, kind]);
  const productivity = similar.length ? similar.reduce((sum, e) => sum + e.area, 0) / similar.reduce((sum, e) => sum + e.actual, 0) : null;
  const persist = (next: Experience[]) => {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); setEntries(next); setError(""); }
    catch { setError("Speichern auf diesem Gerät nicht möglich. Bitte Browser-Speicher prüfen."); }
  };
  const save = () => {
    const value = Number(actual.replace(",", "."));
    if (!approved || !Number.isFinite(area) || area <= 0 || !Number.isFinite(expected) || expected <= 0 || !Number.isFinite(value) || value <= 0) {
      setError("Bitte Fläche, kalkulierte Stunden und tatsächliche Stunden (jeweils > 0) eingeben und die Freigabe bestätigen.");
      return;
    }
    persist([{ id: window.crypto.randomUUID(), kind, area, expected, actual: value, savedAt: new Date().toISOString() }, ...entries].slice(0, 100));
    setActual(""); setApproved(false);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>KI-Training & Lernsystem</CardTitle>
        <CardDescription>Erfahrungswerte nach einem abgeschlossenen Einsatz freiwillig erfassen. Keine automatische Änderung von Preisen, Angeboten oder Kalkulationen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">Aktuelle Grundlage: {kind} · {Number.isFinite(area) ? area : 0} m² · {Number.isFinite(expected) ? expected : 0} kalkulierte Arbeitsstunden.</p>
        <div className="space-y-2">
          <Label htmlFor="ki-actual-hours">Tatsächlich geleistete Arbeitsstunden (alle Mitarbeiter zusammen)</Label>
          <Input id="ki-actual-hours" type="text" inputMode="decimal" value={actual} onChange={(event) => setActual(event.target.value)} placeholder="z. B. 3,5" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
          Ich bestätige die tatsächlichen Stunden und möchte diesen Erfahrungswert speichern.
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={!approved} onClick={save}>Erfahrungswert speichern</Button>
        <div className="rounded-md border p-3 text-sm space-y-2">
          <p className="font-medium">Gespeicherte Erfahrungen: {entries.length}</p>
          {productivity !== null ? (
            <p>Orientierungswert für {kind}: ca. {productivity.toFixed(1)} m² je Mitarbeiterstunde aus {similar.length} Einträgen. Bitte für neue Aufträge prüfen.</p>
          ) : <p className="text-muted-foreground">Noch keine vergleichbaren Erfahrungswerte für diese Reinigungsart.</p>}
          <p className="text-xs text-muted-foreground">Erste Ausbaustufe: Speicherung nur in diesem Browser auf diesem Gerät. Keine Synchronisierung und kein Training eines KI-Modells. Die Erfahrungswerte werden noch nicht automatisch für neue Kalkulationen verwendet.</p>
          {entries.length > 0 && <Button type="button" variant="outline" onClick={() => { if (window.confirm("Alle lokal gespeicherten KI-Erfahrungswerte löschen?")) persist([]); }}>Lokale Erfahrungen löschen</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
