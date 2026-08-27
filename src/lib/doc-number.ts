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

/**
 * Platzhalter-Nummer für Entwürfe/Testbelege (z. B. RE-DEMO-4821).
 * Sie erhöht den fortlaufenden Zähler NICHT – damit entstehen im Nummernkreis
 * keine Lücken (GoBD). Die echte Nummer wird erst beim Festschreiben vergeben.
 */
export function draftPlaceholderNumber(kind: DocKind | "storno"): string {
  const prefix =
    kind === "invoice" ? "RE" : kind === "order" ? "AB" : kind === "storno" ? "ST" : "AN";
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-DEMO-${rand}${Date.now().toString().slice(-3)}`;
}

/** Erkennt Platzhalter-Nummern von Entwürfen. */
export function isDraftPlaceholder(number: string | null | undefined): boolean {
  return /-DEMO-/.test(String(number ?? ""));
}
