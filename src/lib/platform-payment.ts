import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_DETAILS } from "@/lib/plan-orders";

export type PlatformPayment = {
  recipient: string;
  iban: string;
  bic: string;
  bank: string;
  terms: string;
  vat_id: string;
  email: string;
  address_line: string;
  postal_code: string;
  city: string;
};

export const PLATFORM_SETTINGS_ID = "default";

/** Fallback, solange in der Administration noch keine Bankdaten gepflegt sind. */
export const PLATFORM_PAYMENT_FALLBACK: PlatformPayment = {
  recipient: PAYMENT_DETAILS.recipient,
  iban: PAYMENT_DETAILS.iban,
  bic: PAYMENT_DETAILS.bic,
  bank: PAYMENT_DETAILS.bank,
  terms: PAYMENT_DETAILS.terms,
  vat_id: PAYMENT_DETAILS.vatId,
  email: PAYMENT_DETAILS.email,
  address_line: "",
  postal_code: "",
  city: "",
};


function merge(row: Partial<PlatformPayment> | null): PlatformPayment {
  const out = { ...PLATFORM_PAYMENT_FALLBACK };
  if (!row) return out;
  for (const key of Object.keys(out) as (keyof PlatformPayment)[]) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  return out;
}

export async function fetchPlatformPayment(): Promise<PlatformPayment> {
  const { data } = await supabase
    .from("platform_settings")
    .select("recipient, iban, bic, bank, terms, vat_id, email")
    .eq("id", PLATFORM_SETTINGS_ID)
    .maybeSingle();
  return merge(data);
}

/** Bankdaten des Plattform-Betreibers (in der Administration pflegbar). */
export function usePlatformPayment() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: fetchPlatformPayment,
    staleTime: 5 * 60_000,
  });
}

/** IBAN ohne Leerzeichen (für EPC-QR und Validierung). */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** Formatiert eine IBAN in 4er-Gruppen. */
export function formatIban(iban: string): string {
  return normalizeIban(iban)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/** Prüft IBAN-Länge und Modulo-97-Prüfsumme. */
export function isValidIban(iban: string): boolean {
  const v = normalizeIban(iban);
  if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
