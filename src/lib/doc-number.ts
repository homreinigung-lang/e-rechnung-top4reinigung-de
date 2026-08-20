import { supabase } from "@/integrations/supabase/client";
import type { DocKind } from "@/lib/format";

/**
 * Reserviert atomar die nächste freie Belegnummer in der Datenbank.
 * Verhindert doppelte Nummern (Unique-Constraint) bei parallelen Anlagen.
 */
export async function reserveDocumentNumber(kind: DocKind): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", { _kind: kind });
  if (error) throw error;
  if (!data) throw new Error("Belegnummer konnte nicht vergeben werden.");
  return data;
}
