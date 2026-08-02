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
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  return path;
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
