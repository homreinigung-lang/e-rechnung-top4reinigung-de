import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "@/lib/admin";

export const VAT_RATE = 0.19;
export const TRIAL_DAYS = 60;

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

/** Pakete, die das Reverse-Charge-Verfahren nutzen dürfen (Basis ausgenommen). */
const REVERSE_CHARGE_PLANS = new Set(["pro", "enterprise"]);

/** Ist für dieses Paket Reverse-Charge grundsätzlich möglich? */
export function planAllowsReverseCharge(plan: Plan): boolean {
  return REVERSE_CHARGE_PLANS.has((plan.code || "").trim().toLowerCase());
}

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
  const isEu = EU_COUNTRIES.has(code);
  const reverseCharge = isEu && vatId.trim().length > 3 && planAllowsReverseCharge(plan);
  // Basis-Paket: EU-Kunden werden weiterhin mit deutscher USt. abgerechnet.
  const taxable = code === "DE" || (isEu && !reverseCharge);
  const vatCents = taxable ? Math.round(netCents * VAT_RATE) : 0;
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
      const orderNumber = `BEST-${new Date().getFullYear()}-${String(
        Math.floor(Math.random() * 100000),
      ).padStart(5, "0")}`;
      const { error } = await supabase
        .from("plan_orders")
        .insert({
          order_number: orderNumber,
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
        });
      if (error) throw error;
      return { orderNumber, totals };
    },
  });
}

/* -------------------------------------------------------------------------
 * Zusatz-Mitarbeitende im Pro-Paket
 * ---------------------------------------------------------------------- */

/** Im Pro-Paket enthaltene Mitarbeitende. */
export const PRO_INCLUDED_EMPLOYEES = 20;
/** Aufpreis je zusätzlichem Mitarbeitenden (monatlich, in Cent). */
export const EXTRA_EMPLOYEE_CENTS = 250;

/** Anzahl der Mitarbeitenden über dem Inklusiv-Kontingent. */
export function extraEmployees(planCode: string, employeeCount: number): number {
  if ((planCode || "").trim().toLowerCase() !== "pro") return 0;
  return Math.max(0, employeeCount - PRO_INCLUDED_EMPLOYEES);
}

/** Monatlicher Aufpreis für zusätzliche Mitarbeitende (in Cent). */
export function extraEmployeeCents(planCode: string, employeeCount: number): number {
  return extraEmployees(planCode, employeeCount) * EXTRA_EMPLOYEE_CENTS;
}

/** Monatlicher Gesamtpreis inkl. Zusatz-Mitarbeitenden (in Cent). */
export function monthlyPriceCents(plan: Plan, employeeCount: number): number {
  return plan.price_monthly_cents + extraEmployeeCents(plan.code, employeeCount);
}
