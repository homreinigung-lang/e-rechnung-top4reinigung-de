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

function validateProjectStorageUrl(fileUrl: string, userId: string): string {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    throw new Error("Ungültige Datei-Adresse.");
  }

  if (url.protocol !== "https:") throw new Error("Nur HTTPS-Dateien sind erlaubt.");

  const configured = process.env["SUPABASE_URL"];
  if (!configured) throw new Error("Supabase ist serverseitig nicht konfiguriert.");
  const allowedHost = new URL(configured).hostname;
  if (url.hostname !== allowedHost) throw new Error("Datei muss aus dem eigenen Dateispeicher stammen.");

  const path = decodeURIComponent(url.pathname);
  const prefix = `/storage/v1/object/sign/firmen-dateien/${userId}/`;
  if (!path.startsWith(prefix)) throw new Error("Kein Zugriff auf diese Datei.");

  const relative = path.slice(prefix.length);
  if (!(relative.startsWith("kalkulation/") || relative.startsWith("ausschreibung/"))) {
    throw new Error("Datei liegt nicht im erlaubten Projektordner.");
  }

  return url.toString();
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
  .handler(async ({ data, context }): Promise<ScannedProject> => {
    const { analyzeProjectFile } = await import("@/lib/project-scan.server");
    const safeUrl = validateProjectStorageUrl(data.fileUrl, context.userId);
    return analyzeProjectFile(safeUrl, data.mimeType, data.mode);
  });
