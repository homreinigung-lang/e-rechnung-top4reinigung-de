import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Geokodierung von Adressen über OpenStreetMap/Nominatim.
 * Läuft serverseitig, damit CORS und User-Agent-Vorgaben eingehalten werden.
 * Nur für angemeldete Konten, um Missbrauch des externen Dienstes zu verhindern.
 */
export const geocodeAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ addresses: z.array(z.string().min(3)).max(12) }).parse(data))
  .handler(async ({ data }) => {
    const unique = Array.from(new Set(data.addresses.map((a) => a.trim()).filter(Boolean)));
    const result: Record<string, { lat: number; lon: number; label: string }> = {};

    const lookup = async (query: string) => {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "de,at,ch,fr,lu,be,nl");
      const res = await fetch(url, {
        headers: {
          "User-Agent": "GebCalc/1.0 (Einsatzplanung)",
          "Accept-Language": "de",
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;
      const hit = json[0];
      if (!hit) return null;
      return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
    };

    for (const address of unique) {
      // Varianten: Original, mit ausgeschriebenem "Straße", nur PLZ/Ort
      const parts = address
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const expanded = address.replace(/(\S)str\.?\b/gi, "$1straße");
      const variants = Array.from(
        new Set([address, expanded, parts.slice(1).join(", "), parts.slice(-2).join(", ")]),
      ).filter((v) => v.length > 3);

      for (const variant of variants) {
        try {
          const hit = await lookup(variant);
          // Nominatim erlaubt max. 1 Anfrage pro Sekunde
          await new Promise((r) => setTimeout(r, 1100));
          if (hit) {
            result[address] = hit;
            break;
          }
        } catch {
          // nächste Variante versuchen
        }
      }
    }

    return result;
  });
