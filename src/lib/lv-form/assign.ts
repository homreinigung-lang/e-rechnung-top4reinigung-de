import { LV_FIELDS } from "./fields";
import type { Confidence, LvAcroField, LvFieldKey, LvMarker } from "./types";

/**
 * Zuordnungslogik für LV-Positionen.
 * Ziel: jede Kennzahl genau einmal, keine Position ohne Kennzahl.
 */

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Lesereihenfolge: Seite, dann von oben nach unten, dann von links nach rechts. */
function readingOrder(a: LvMarker, b: LvMarker): number {
  return a.pageIndex - b.pageIndex || b.y - a.y || a.x - b.x;
}

function score(marker: LvMarker, preferredId?: string): number {
  if (preferredId && marker.id === preferredId) return 100;
  return CONFIDENCE_RANK[marker.confidence] + (marker.manual ? 1 : 0);
}

/**
 * Entfernt Mehrfachzuordnungen: pro Kennzahl bleibt genau ein Marker bestehen.
 * `preferredId` gewinnt immer (zuletzt vom Benutzer gewählte Position).
 */
export function dedupeMarkerKeys(markers: LvMarker[], preferredId?: string): LvMarker[] {
  const winner = new Map<LvFieldKey, string>();
  for (const marker of [...markers].sort(readingOrder)) {
    if (!marker.key) continue;
    const current = winner.get(marker.key);
    if (!current) {
      winner.set(marker.key, marker.id);
      continue;
    }
    const currentMarker = markers.find((m) => m.id === current)!;
    if (score(marker, preferredId) > score(currentMarker, preferredId)) {
      winner.set(marker.key, marker.id);
    }
  }
  return markers.map((m) => (m.key && winner.get(m.key) !== m.id ? { ...m, key: null } : m));
}

/**
 * Ordnet allen noch freien Positionen automatisch die verbleibenden Kennzahlen
 * in Lesereihenfolge zu – nach vorheriger Entdopplung.
 */
export function autoAssignMarkers(markers: LvMarker[], preferredId?: string): LvMarker[] {
  const deduped = dedupeMarkerKeys(markers, preferredId);
  const used = new Set(deduped.map((m) => m.key).filter(Boolean) as LvFieldKey[]);
  const free = LV_FIELDS.map((f) => f.key).filter((k) => !used.has(k));
  if (free.length === 0) return deduped;

  const byId = new Map(deduped.map((m) => [m.id, m]));
  for (const marker of [...deduped].sort(readingOrder)) {
    if (marker.key) continue;
    const next = free.shift();
    if (!next) break;
    byId.set(marker.id, { ...marker, key: next });
  }
  return deduped.map((m) => byId.get(m.id)!);
}

/** Gleiche Regel für echte Formular-PDFs: jede Kennzahl nur einem Feld zuordnen. */
export function dedupeMapping(
  fields: LvAcroField[],
  mapping: Record<string, LvFieldKey | null>,
  preferredName?: string,
): Record<string, LvFieldKey | null> {
  const winner = new Map<LvFieldKey, string>();
  for (const field of fields) {
    const key = mapping[field.name] ?? null;
    if (!key) continue;
    const current = winner.get(key);
    if (!current || field.name === preferredName) winner.set(key, field.name);
  }
  const next: Record<string, LvFieldKey | null> = {};
  for (const field of fields) {
    const key = mapping[field.name] ?? null;
    next[field.name] = key && winner.get(key) === field.name ? key : null;
  }
  return next;
}
