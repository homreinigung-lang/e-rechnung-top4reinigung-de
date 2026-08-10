import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScannedFloorplan } from "@/lib/floorplan-scan.server";

export type { ScannedFloorplan };

/** Erkennt m², Räume und Etagen aus einem hochgeladenen Grundriss oder Foto. */
export const scanFloorplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { dataUrl: string; mimeType: string }) => {
    if (!data?.dataUrl?.startsWith("data:")) throw new Error("Ungültige Datei.");
    if (data.dataUrl.length > 14_000_000) throw new Error("Datei ist zu groß (max. ca. 10 MB).");
    return { dataUrl: data.dataUrl, mimeType: data.mimeType || "application/pdf" };
  })
  .handler(async ({ data }): Promise<ScannedFloorplan> => {
    const { extractFloorplan } = await import("@/lib/floorplan-scan.server");
    return extractFloorplan(data.dataUrl, data.mimeType);
  });
