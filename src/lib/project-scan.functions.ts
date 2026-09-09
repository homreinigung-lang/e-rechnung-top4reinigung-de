import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScannedProject, ScannedRoom, ScannedLvItem } from "@/lib/project-scan.server";

export type { ScannedProject, ScannedRoom, ScannedLvItem };

function resolveProjectScanMode(fileUrl: string, requestedMode: string): "floorplan" | "tender" {
  const decodedUrl = decodeURIComponent(fileUrl).toLowerCase();

  // Storage folder is the authoritative source. This protects Grundriss PDFs
  // from accidentally being analysed as tender documents and keeps both
  // workflows separated even if a caller sends the wrong mode.
  if (decodedUrl.includes("/kalkulation/")) return "floorplan";
  if (decodedUrl.includes("/ausschreibung/")) return "tender";

  return requestedMode === "tender" ? "tender" : "floorplan";
}

/** Liest Räume (Grundriss) bzw. Leistungsverzeichnis (Ausschreibung) aus einer Projektdatei. */
export const analyzeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileUrl: string; mimeType: string; mode: string }) => {
    if (!data?.fileUrl?.startsWith("http")) throw new Error("Ungültige Datei-Adresse.");
    return {
      fileUrl: data.fileUrl,
      mimeType: data.mimeType || "application/pdf",
      mode: resolveProjectScanMode(data.fileUrl, data.mode),
    };
  })
  .handler(async ({ data }): Promise<ScannedProject> => {
    const { analyzeProjectFile } = await import("@/lib/project-scan.server");
    return analyzeProjectFile(data.fileUrl, data.mimeType, data.mode);
  });
