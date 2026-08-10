import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScannedFloorplan } from "@/lib/floorplan-scan.server";

export type { ScannedFloorplan };

/** Erkennt m², Räume und Etagen aus einem hochgeladenen Grundriss oder Foto. */
export const scanFloorplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileUrl: string; mimeType: string }) => {
    if (!/^https?:\/\//.test(data?.fileUrl ?? "")) throw new Error("Ungültige Datei-Adresse.");
    return { fileUrl: data.fileUrl, mimeType: data.mimeType || "application/pdf" };
  })
  .handler(async ({ data }): Promise<ScannedFloorplan> => {
    const { extractFloorplanFromUrl } = await import("@/lib/floorplan-scan.server");
    return extractFloorplanFromUrl(data.fileUrl, data.mimeType);
  });
