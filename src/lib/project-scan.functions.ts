import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScannedProject, ScannedRoom, ScannedLvItem } from "@/lib/project-scan.server";

export type { ScannedProject, ScannedRoom, ScannedLvItem };

/** Liest Räume (Grundriss) bzw. Leistungsverzeichnis (Ausschreibung) aus einer Projektdatei. */
export const analyzeProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileUrl: string; mimeType: string; mode: string }) => {
    if (!data?.fileUrl?.startsWith("http")) throw new Error("Ungültige Datei-Adresse.");
    return {
      fileUrl: data.fileUrl,
      mimeType: data.mimeType || "application/pdf",
      mode: data.mode === "tender" ? ("tender" as const) : ("floorplan" as const),
    };
  })
  .handler(async ({ data }): Promise<ScannedProject> => {
    const { analyzeProjectFile } = await import("@/lib/project-scan.server");
    return analyzeProjectFile(data.fileUrl, data.mimeType, data.mode);
  });
