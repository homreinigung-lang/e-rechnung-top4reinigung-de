/**
 * Gemeinsame Datenbeschaffung für Finanz-Dashboard und EÜR/Steuerberater-Auswertung.
 * Beide Auswertungen lesen exakt dieselben Tabellen (`documents`, `expenses`),
 * mit denselben Filtern: keine Papierkorb-Einträge, Zeitraum inklusive Grenzen.
 */
import { supabase } from "@/integrations/supabase/client";

/** Spalten, die für Auswertungen benötigt werden. */
export const EUER_DOCUMENT_COLUMNS =
  "id, type, number, status, issue_date, due_date, reminder_level, total, net_total, vat_amount, customer_name, customer_company, is_storno";
export const EUER_EXPENSE_COLUMNS =
  "id, expense_date, category, net_amount, vat_amount, gross_amount, supplier, document_number";

export type EuerRange = { from: string; to: string };

/** Rechnungen/Belege im Zeitraum – ohne gelöschte (Papierkorb) Einträge. */
export async function fetchEuerDocuments(range?: EuerRange) {
  let q = supabase
    .from("documents")
    .select(EUER_DOCUMENT_COLUMNS)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });
  if (range) q = q.gte("issue_date", range.from).lte("issue_date", range.to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Ausgaben im Zeitraum – ohne gelöschte (Papierkorb) Einträge. */
export async function fetchEuerExpenses(range?: EuerRange) {
  let q = supabase
    .from("expenses")
    .select(EUER_EXPENSE_COLUMNS)
    .is("deleted_at", null)
    .order("expense_date", { ascending: false });
  if (range) q = q.gte("expense_date", range.from).lte("expense_date", range.to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
