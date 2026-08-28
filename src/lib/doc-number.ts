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

/**
 * Vergibt automatisch die offizielle, fortlaufende Belegnummer (z. B. AN-2026-0001,
 * RE-2026-0001), sobald ein Entwurf zu einem echten Beleg wird (Versand, Annahme,
 * Umwandlung). Belege mit bereits vergebener Nummer bleiben unverändert.
 */
export async function ensureOfficialNumber(id: string): Promise<string> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number, type")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!isDraftPlaceholder(doc.number)) return String(doc.number);

  const number = await reserveDocumentNumber(doc.type as DocKind);
  const { error: updateError } = await supabase
    .from("documents")
    .update({ number } as never)
    .eq("id", id);
  if (updateError) throw updateError;

  const { logAudit } = await import("@/lib/gobd");
  await logAudit("number_assigned", { id, number }, { previous: doc.number });
  return number;
}
