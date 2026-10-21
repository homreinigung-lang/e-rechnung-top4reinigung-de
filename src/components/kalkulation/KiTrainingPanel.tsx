import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/auth-user";
import type { KalkulationStateContext } from "./useKalkulationState";

type Experience = { id: string; kind: string; area: number; expected: number; actual: number; savedAt: string };
const KEY = "gebcalc-ki-training-experiences-v1";

function loadLocal(): Experience[] {
  try {
    if (typeof window === "undefined") return [];
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Experience => e !== null && typeof e === "object" &&
      typeof e.id === "string" && typeof e.kind === "string" &&
      Number.isFinite(e.area) && e.area > 0 &&
      Number.isFinite(e.expected) && e.expected > 0 &&
      Number.isFinite(e.actual) && e.actual > 0 && typeof e.savedAt === "string").slice(0, 100);
  } catch { return []; }
}

export function KiTrainingPanel({ state }: { state: KalkulationStateContext }) {
  const [cloud, setCloud] = useState<Experience[]>([]);
  const [local, setLocal] = useState<Experience[]>([]);
  const [actual, setActual] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const area = Number(state.area);
  const expected = Number(state.hours);
  const kind = state.selected.label;

  useEffect(() => { setLocal(loadLocal()); }, []);
  const refresh = async () => {
    const uid = await requireUserId();
    const { data, error: fetchError } = await supabase.from("ki_training_experiences")
      .select("id,cleaning_type,area_sqm,estimated_labor_hours,actual_labor_hours,created_at")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(100);
    if (fetchError) throw fetchError;
    setCloud((data ?? []).map((row) => ({
      id: row.id, kind: row.cleaning_type, area: Number(row.area_sqm),
      expected: Number(row.estimated_labor_hours), actual: Number(row.actual_labor_hours),
      savedAt: row.created_at,
    })));
    setLoaded(true);
  };
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const uid = await requireUserId();
        const { data, error: fetchError } = await supabase.from("ki_training_experiences")
          .select("id,cleaning_type,area_sqm,estimated_labor_hours,actual_labor_hours,created_at")
          .eq("user_id", uid).order("created_at", { ascending: false }).limit(100);
        if (fetchError) throw fetchError;
        if (active) {
          setCloud((data ?? []).map((row) => ({
            id: row.id, kind: row.cleaning_type, area: Number(row.area_sqm),
            expected: Number(row.estimated_labor_hours), actual: Number(row.actual_labor_hours),
            savedAt: row.created_at,
          })));
          setLoaded(true);
        }
      } catch {
        if (active) setError("Cloud-Daten nicht verfügbar. Bitte Anmeldung und Datenbank-Migration prüfen.");
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const similar = useMemo(() => cloud.filter((e) => e.kind === kind && e.area > 0 && e.actual > 0), [cloud, kind]);
  const totalArea = similar.reduce((sum, e) => sum + e.area, 0);
  const totalHours = similar.reduce((sum, e) => sum + e.actual, 0);
  const productivity = totalHours > 0 ? totalArea / totalHours : null;
  const save = async () => {
    const value = Number(actual.replace(",", "."));
    if (!approved || !Number.isFinite(area) || area <= 0 || !Number.isFinite(expected) || expected <= 0 || !Number.isFinite(value) || value <= 0) {
      setError("Bitte Fläche, geplante und tatsächliche Stunden (> 0) prüfen und bestätigen.");
      return;
    }
    setBusy(true); setError("");
    try {
      const uid = await requireUserId();
      const { error: saveError } = await supabase.from("ki_training_experiences").insert({
        user_id: uid, cleaning_type: kind, area_sqm: area,
        estimated_labor_hours: expected, actual_labor_hours: value,
      });
      if (saveError) throw saveError;
      await refresh();
      setActual(""); setApproved(false);
    } catch {
      setError("Speichern in der Cloud fehlgeschlagen. Bitte Verbindung, Anmeldung und Tabellenfreigabe prüfen.");
    } finally { setBusy(false); }
  };
  const deleteEntry = async (id: string) => {
    if (!window.confirm("Diesen Cloud-Erfahrungswert wirklich löschen?")) return;
    setBusy(true); setError("");
    try {
      const uid = await requireUserId();
      const { error: deleteError } = await supabase.from("ki_training_experiences").delete().eq("id", id).eq("user_id", uid);
      if (deleteError) throw deleteError;
      await refresh();
    } catch { setError("Löschen fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>KI-Training & Lernsystem</CardTitle>
        <CardDescription>Freigegebene Ist-Stunden sicher im Firmenkonto speichern. Preise und Angebote bleiben unverändert.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">Aktuelle Grundlage: {kind} · {Number.isFinite(area) ? area : 0} m² · {Number.isFinite(expected) ? expected : 0} kalkulierte Arbeitsstunden.</p>
        <div className="space-y-2">
          <Label htmlFor="ki-actual-hours">Tatsächlich geleistete Arbeitsstunden (alle Mitarbeiter zusammen)</Label>
          <Input id="ki-actual-hours" type="text" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="z. B. 3,5" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
          Ich bestätige die tatsächlichen Stunden und die Speicherung in meinem Firmenkonto.
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={!approved || busy || !loaded} onClick={() => void save()}>{busy ? "Bitte warten…" : "Erfahrungswert in Cloud speichern"}</Button>
        <div className="rounded-md border p-3 text-sm space-y-2">
          <p className="font-medium">Cloud-Erfahrungen: {loaded ? cloud.length : "Wird geladen…"}</p>
          {productivity !== null ? (
            <p>Orientierungswert für {kind}: ca. {productivity.toFixed(1)} m² je Mitarbeiterstunde aus {similar.length} Einträgen.</p>
          ) : <p className="text-muted-foreground">Noch keine vergleichbaren Cloud-Erfahrungen für diese Reinigungsart.</p>}
          {cloud.slice(0, 10).map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <span>{e.kind} · {e.area} m² · Soll {e.expected} h / Ist {e.actual} h</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void deleteEntry(e.id)}>Löschen</Button>
            </div>
          ))}
          {local.length > 0 && <p className="text-xs text-muted-foreground">Vorhandene lokale Erfahrungen: {local.length}. Sie bleiben auf diesem Gerät erhalten und werden nicht ohne Ihre Freigabe hochgeladen.</p>}
          <p className="text-xs text-muted-foreground">Cloud-Werte sind nach Anmeldung geräteübergreifend sichtbar. Kein KI-Modelltraining und keine automatische Änderung von Kalkulationen oder Preisen.</p>
        </div>
      </CardContent>
    </Card>
  );
}
