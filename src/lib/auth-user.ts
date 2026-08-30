import { supabase } from "@/integrations/supabase/client";

/**
 * Liefert die ID des angemeldeten Kontos.
 *
 * Bewusst zuerst über die lokal gespeicherte Sitzung (`getSession`), damit
 * alltägliche Aktionen (Speichern, Upload, Zeiterfassung) keine zusätzliche
 * Anfrage an den Login-Dienst auslösen. Nur wenn lokal keine Sitzung vorliegt,
 * wird einmalig beim Server nachgefragt.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (id) return id;
  } catch {
    // Kein lokaler Sitzungszugriff – unten serverseitig prüfen.
  }
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Wie `currentUserId`, wirft aber eine klare Meldung, wenn niemand angemeldet ist. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("Nicht angemeldet");
  return id;
}
