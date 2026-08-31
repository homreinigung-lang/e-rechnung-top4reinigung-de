import { supabase } from "@/integrations/supabase/client";
import { formatPeriod, monthKey, parseServicePeriod } from "@/lib/invoice-period";

/**
 * Sucht eine bereits bestehende Rechnung für denselben Kunden und denselben
 * Leistungsmonat. Entwürfe, Stornos und gelöschte Belege zählen nicht.
 * Gibt die Nummer der Dublette zurück oder null.
 */
export async function findDuplicateInvoice(params: {
  currentId: string;
  customerId: string | null;
  servicePeriod: string | null | undefined;
}): Promise<{ number: string; period: string } | null> {
  const period = parseServicePeriod(params.servicePeriod);
  if (!params.customerId || !period) return null;

  const { data, error } = await supabase
    .from("documents")
    .select("id, number, status, service_period, is_storno, deleted_at")
    .eq("type", "invoice")
    .eq("customer_id", params.customerId)
    .is("deleted_at", null)
    .neq("id", params.currentId);
  if (error) return null;

  const key = monthKey(period.start);
  const hit = (data ?? []).find((d) => {
    if (d.is_storno) return false;
    if (d.status === "draft" || d.status === "cancelled") return false;
    const other = parseServicePeriod(d.service_period);
    return other ? monthKey(other.start) === key : false;
  });
  if (!hit) return null;
  return { number: String(hit.number), period: formatPeriod(period) };
}
