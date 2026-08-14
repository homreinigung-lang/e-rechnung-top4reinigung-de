import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Geokodierung von Adressen über OpenStreetMap/Nominatim.
 * Läuft serverseitig, damit CORS und User-Agent-Vorgaben eingehalten werden.
 */
export const geocodeAddresses = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ addresses: z.array(z.string().min(3)).max(12) }).parse(data),
  )
  .handler(async ({ data }) => {
    const unique = Array.from(new Set(data.addresses.map((a) => a.trim()).filter(Boolean)));
    const result: Record<string, { lat: number; lon: number; label: string }> = {};

    for (const address of unique) {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", address);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "1");
        url.searchParams.set("countrycodes", "de,at,ch");
        const res = await fetch(url, {
          headers: {
            "User-Agent": "HomR-Office/1.0 (Einsatzplanung)",
            "Accept-Language": "de",
          },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as Array<{
          lat: string;
          lon: string;
          display_name: string;
        }>;
        const hit = json[0];
        if (!hit) continue;
        result[address] = {
          lat: Number(hit.lat),
          lon: Number(hit.lon),
          label: hit.display_name,
        };
      } catch {
        // Adresse überspringen
      }
      // Nominatim erlaubt max. 1 Anfrage pro Sekunde
      await new Promise((r) => setTimeout(r, 1100));
    }

    return result;
  });
