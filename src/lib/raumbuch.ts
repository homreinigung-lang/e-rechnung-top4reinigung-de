/**
 * Raumbuch-Daten (project_rooms) für die Kalkulation.
 * Liefert die tatsächliche Gesamtfläche und den Stundenbedarf je Einsatz
 * auf Basis der raumtypbezogenen Leistungswerte (mit pauschalem Fallback).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERFORMANCE_RATES,
  hoursPerVisit,
  type PerformanceRate,
} from "@/lib/leistungswerte";

export type RaumbuchInfo = {
  roomCount: number;
  totalArea: number;
  /** Stunden je Reinigungsdurchgang aus den Raumflächen. */
  hoursPerVisit: number;
  matched: number;
  unmatched: number;
};

function fallbackRates(): PerformanceRate[] {
  return DEFAULT_PERFORMANCE_RATES.map((r, n) => ({ ...r, id: `default-${n}`, active: true }));
}

/**
 * Lädt das Raumbuch eines Projekts. Gibt null zurück, wenn kein Projekt
 * verknüpft ist oder keine Räume mit Fläche erfasst sind – dann bleibt die
 * bisherige KI-/Texteingabe-Logik unverändert aktiv.
 */
export function useRaumbuch(projectId: string | null) {
  return useQuery<RaumbuchInfo | null>({
    queryKey: ["raumbuch-kalkulation", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      if (!projectId) return null;

      const [roomsRes, ratesRes, projectRes] = await Promise.all([
        supabase
          .from("project_rooms")
          .select("name, usage_type, floor_covering, area_sqm")
          .eq("project_id", projectId),
        supabase
          .from("performance_rates")
          .select("id, label, usage_type, floor_covering, sqm_per_hour, active"),
        supabase.from("projects").select("sqm_per_hour").eq("id", projectId).maybeSingle(),
      ]);
      if (roomsRes.error) throw roomsRes.error;
      if (ratesRes.error) throw ratesRes.error;
      if (projectRes.error) throw projectRes.error;

      const rooms = (roomsRes.data ?? []).map((r) => ({
        name: r.name ?? "",
        usage_type: r.usage_type ?? "",
        floor_covering: r.floor_covering ?? "",
        area_sqm: Number(r.area_sqm || 0),
      }));
      const totalArea = rooms.reduce((s, r) => s + r.area_sqm, 0);
      if (rooms.length === 0 || totalArea <= 0) return null;

      const rates = (ratesRes.data ?? []) as PerformanceRate[];
      const usable = rates.length > 0 ? rates : fallbackRates();
      const fallback = Number(projectRes.data?.sqm_per_hour || 0);
      const { hours, matched, unmatched } = hoursPerVisit(rooms, usable, fallback);

      return {
        roomCount: rooms.length,
        totalArea: Math.round(totalArea * 100) / 100,
        hoursPerVisit: Math.round(hours * 100) / 100,
        matched,
        unmatched,
      };
    },
  });
}
