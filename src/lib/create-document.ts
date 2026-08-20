import { supabase } from "@/integrations/supabase/client";
import { addDays, today } from "@/lib/format";
import { reserveDocumentNumber } from "@/lib/doc-number";

/**
 * Legt einen neuen Beleg (Rechnung oder Angebot) als Entwurf an und liefert
 * dessen ID zurück. Die Nummer wird fortlaufend vergeben.
 */
export async function createDocument(type: "invoice" | "quote"): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Nicht angemeldet");

  const { data: settings } = await supabase
    .from("company_settings")
    .select("payment_terms_days")
    .maybeSingle();

  const number = await reserveDocumentNumber(type);
  const issue = today();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      type,
      number,
      issue_date: issue,
      // Bei Angeboten ist „gültig bis“ optional und wird nicht vorbelegt.
      due_date: type === "invoice" ? addDays(issue, settings?.payment_terms_days ?? 14) : null,
      reverse_charge: type === "invoice",
      tax_mode: type === "quote" ? "domestic" : "eu_reverse_charge",
      vat_rate: type === "quote" ? 19 : 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
