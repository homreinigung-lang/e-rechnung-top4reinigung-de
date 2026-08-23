import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "@/lib/admin";

export const VAT_RATE = 0.19;
export const TRIAL_DAYS = 30;

/** Zahlungsdaten für die Rechnung an Neukunden. */
export const PAYMENT_DETAILS = {
  recipient: "GebCalc – Rechnungssystem",
  iban: "DE00 0000 0000 0000 0000 00",
  bic: "SAKSDE55XXX",
  bank: "Sparkasse Saarbrücken",
  terms: "Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt, ohne Abzug.",
  vatId: "DE458492078",
  email: "info@top4reinigung.de",
};

/** EU-Mitgliedstaaten ohne Deutschland – relevant für Reverse-Charge. */
const EU_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT",
  "LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

export type OrderInput = {
  plan: Plan;
  billingInterval: "monthly" | "yearly";
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  note: string;
};

export type OrderTotals = {
  netCents: number;
  vatCents: number;
  grossCents: number;
  reverseCharge: boolean;
};

/** Netto, Umsatzsteuer und Brutto für die gewählte Laufzeit berechnen. */
export function calcTotals(
  plan: Plan,
  billingInterval: "monthly" | "yearly",
  country: string,
  vatId: string,
): OrderTotals {
  const netCents =
    billingInterval === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const code = (country || "DE").trim().toUpperCase();
  const reverseCharge = EU_COUNTRIES.has(code) && vatId.trim().length > 3;
  const vatCents = reverseCharge || code !== "DE" ? 0 : Math.round(netCents * VAT_RATE);
  return { netCents, vatCents, grossCents: netCents + vatCents, reverseCharge };
}

export type OrderResult = {
  orderNumber: string;
  totals: OrderTotals;
};

/** Bestellung/Rechnungsanfrage speichern. */
export function useCreatePlanOrder() {
  return useMutation({
    mutationFn: async (input: OrderInput): Promise<OrderResult> => {
      const totals = calcTotals(input.plan, input.billingInterval, input.country, input.vatId);
      const { data, error } = await supabase
        .from("plan_orders")
        .insert({
          plan_id: input.plan.id,
          plan_code: input.plan.code,
          plan_name: input.plan.name,
          billing_interval: input.billingInterval,
          company_name: input.companyName.trim(),
          contact_name: input.contactName.trim(),
          email: input.email.trim(),
          phone: input.phone.trim(),
          address_line: input.addressLine.trim(),
          postal_code: input.postalCode.trim(),
          city: input.city.trim(),
          country: (input.country || "DE").trim().toUpperCase(),
          vat_id: input.vatId.trim(),
          note: input.note.trim(),
          net_cents: totals.netCents,
          vat_cents: totals.vatCents,
          gross_cents: totals.grossCents,
          reverse_charge: totals.reverseCharge,
        })
        .select("order_number")
        .single();
      if (error) throw error;
      return { orderNumber: (data as { order_number: string }).order_number, totals };
    },
  });
}
