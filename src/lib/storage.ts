import { supabase } from "@/integrations/supabase/client";

export const FILES_BUCKET = "firmen-dateien";

/** Lädt eine Datei in den privaten Speicher des angemeldeten Nutzers und gibt den Pfad zurück. */
export async function uploadUserFile(file: File, folder: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Nicht angemeldet");
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
  if (error) throw error;

  return path;
}

/**
 * Erzeugt eine dauerhaft nutzbare (100 Jahre gültige) Adresse für ein Bild,
 * damit es z. B. in E-Mail-Signaturen zuverlässig angezeigt wird.
 */
export async function permanentFileUrl(path: string): Promise<string> {
  if (/^(https?:|data:)/.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 100);
  if (error) throw error;
  return data?.signedUrl ?? "";
}

/** Wandelt einen gespeicherten Pfad in eine signierte, temporär gültige URL um. */
export async function fileUrl(pathOrUrl: string | null | undefined): Promise<string> {
  if (!pathOrUrl) return "";
  if (/^(https?:|data:|blob:)/.test(pathOrUrl)) return pathOrUrl;
  const { data } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? "";
}

/** Lädt eine gespeicherte Datei als Blob – umgeht Browser-/Adblocker-Sperren. */
export async function fetchStoredBlob(pathOrUrl: string): Promise<Blob> {
  if (/^(https?:|data:|blob:)/.test(pathOrUrl)) {
    const res = await fetch(pathOrUrl);
    if (!res.ok) throw new Error("Datei konnte nicht geladen werden.");
    return await res.blob();
  }
  const { data, error } = await supabase.storage.from(FILES_BUCKET).download(pathOrUrl);
  if (error || !data) throw new Error(error?.message ?? "Datei konnte nicht geladen werden.");
  return data;
}

function nameFromPath(pathOrUrl: string) {
  const clean = pathOrUrl.split("?")[0] ?? pathOrUrl;
  return decodeURIComponent(clean.split("/").pop() || "datei");
}

/**
 * Öffnet eine gespeicherte Datei über eine lokale Blob-Adresse.
 * Dadurch greifen Werbeblocker/Filter (ERR_BLOCKED_BY_CLIENT) nicht.
 * Wird das Fenster blockiert, startet automatisch ein Download.
 */
export async function openStoredFile(
  pathOrUrl: string | null | undefined,
  filename?: string,
): Promise<void> {
  if (!pathOrUrl) return;
  const blob = await fetchStoredBlob(pathOrUrl);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || nameFromPath(pathOrUrl);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lädt eine gespeicherte Datei direkt herunter (Blob-Download, nie geblockt). */
export async function downloadStoredFile(
  pathOrUrl: string | null | undefined,
  filename?: string,
): Promise<void> {
  if (!pathOrUrl) return;
  const blob = await fetchStoredBlob(pathOrUrl);
  const { saveFile } = await import("@/lib/download");
  await saveFile(blob, filename || nameFromPath(pathOrUrl));
}

