/**
 * Raumtypbezogene Leistungswerte (m² pro Stunde) für die Gebäudereinigung.
 * Dient als Vorbelegung; Nutzer können die Werte in den Einstellungen pflegen.
 */
export type PerformanceRate = {
  id: string;
  label: string;
  usage_type: string;
  floor_covering: string;
  sqm_per_hour: number;
  active: boolean;
};

export type PerformanceRateSeed = Omit<PerformanceRate, "id" | "active">;

/** Branchenübliche Richtwerte (Unterhaltsreinigung, Deutschland). */
export const DEFAULT_PERFORMANCE_RATES: PerformanceRateSeed[] = [
  { label: "Büro – Teppich", usage_type: "Büro", floor_covering: "Teppich", sqm_per_hour: 250 },
  { label: "Büro – PVC/Linoleum", usage_type: "Büro", floor_covering: "PVC", sqm_per_hour: 220 },
  { label: "Büro – Parkett", usage_type: "Büro", floor_covering: "Parkett", sqm_per_hour: 200 },
  { label: "Büro – Fliesen", usage_type: "Büro", floor_covering: "Fliesen", sqm_per_hour: 200 },
  { label: "Flur / Verkehrsfläche", usage_type: "Flur", floor_covering: "", sqm_per_hour: 300 },
  { label: "Treppenhaus", usage_type: "Treppenhaus", floor_covering: "", sqm_per_hour: 120 },
  {
    label: "WC / Sanitär – Fliesen",
    usage_type: "WC",
    floor_covering: "Fliesen",
    sqm_per_hour: 60,
  },
  { label: "Teeküche / Sozialraum", usage_type: "Küche", floor_covering: "", sqm_per_hour: 100 },
  { label: "Besprechungsraum", usage_type: "Besprechung", floor_covering: "", sqm_per_hour: 260 },
  { label: "Lager / Technik", usage_type: "Lager", floor_covering: "", sqm_per_hour: 400 },
  { label: "Produktion / Halle", usage_type: "Halle", floor_covering: "Beton", sqm_per_hour: 500 },
  {
    label: "Umkleide / Dusche",
    usage_type: "Umkleide",
    floor_covering: "Fliesen",
    sqm_per_hour: 80,
  },
  {
    label: "Treppe / Podest – Fliesen",
    usage_type: "Treppe",
    floor_covering: "Fliesen",
    sqm_per_hour: 130,
  },
  {
    label: "Glas- / Fensterfläche",
    usage_type: "Fenster",
    floor_covering: "Glas",
    sqm_per_hour: 40,
  },
];

function norm(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[äÄ]/g, "a")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, " ")
    .trim();
}

function matches(needle: string, haystack: string): boolean {
  const a = norm(needle);
  const b = norm(haystack);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

/**
 * Sucht den passendsten Leistungswert für einen Raum.
 * Priorität: Nutzungstyp + Bodenbelag > Nutzungstyp/Raumname > Bodenbelag.
 * Gibt null zurück, wenn nichts passt (dann greift der pauschale Fallback).
 */
export function findRate(
  rates: PerformanceRate[],
  room: { name?: string; usage_type?: string; floor_covering?: string },
): PerformanceRate | null {
  const usable = rates.filter((r) => r.active !== false && Number(r.sqm_per_hour) > 0);
  if (usable.length === 0) return null;

  const usage = room.usage_type ?? "";
  const name = room.name ?? "";
  const covering = room.floor_covering ?? "";

  const usageMatch = (r: PerformanceRate) =>
    Boolean(r.usage_type) && (matches(r.usage_type, usage) || matches(r.usage_type, name));
  const coveringMatch = (r: PerformanceRate) =>
    Boolean(r.floor_covering) && matches(r.floor_covering, covering);

  return (
    usable.find((r) => usageMatch(r) && coveringMatch(r)) ??
    usable.find((r) => usageMatch(r) && !r.floor_covering) ??
    usable.find((r) => usageMatch(r)) ??
    usable.find((r) => coveringMatch(r) && !r.usage_type) ??
    usable.find((r) => coveringMatch(r)) ??
    null
  );
}

export type RoomForHours = {
  name?: string;
  usage_type?: string;
  floor_covering?: string;
  area_sqm: number;
};

/**
 * Stundenbedarf je Reinigungsdurchgang aus den Raumflächen.
 * Räume ohne passenden Leistungswert nutzen den pauschalen Fallback (sqm/h).
 */
export function hoursPerVisit(
  rooms: RoomForHours[],
  rates: PerformanceRate[],
  fallbackSqmPerHour: number,
): { hours: number; matched: number; unmatched: number } {
  let hours = 0;
  let matched = 0;
  let unmatched = 0;

  for (const room of rooms) {
    const area = Number(room.area_sqm || 0);
    if (area <= 0) continue;
    const rate = findRate(rates, room);
    const perHour = rate ? Number(rate.sqm_per_hour) : Number(fallbackSqmPerHour || 0);
    if (perHour <= 0) {
      unmatched += 1;
      continue;
    }
    if (rate) matched += 1;
    else unmatched += 1;
    hours += area / perHour;
  }

  return { hours, matched, unmatched };
}
