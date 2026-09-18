import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VAT_RATE = 0.19;
const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);
const REVERSE_CHARGE_PLANS = new Set(["pro", "enterprise"]);

type CreatePlanOrderInput = {
  planId: string;
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

export type SecureOrderResult = {
  orderNumber: string;
  totals: {
    netCents: number;
    vatCents: number;
    grossCents: number;
    reverseCharge: boolean;
  };
};

function calculateTotals(
  plan: { code: string; price_monthly_cents: number; price_yearly_cents: number },
  billingInterval: "monthly" | "yearly",
  country: string,
  vatId: string,
) {
  const netCents =
    billingInterval === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents;
  const code = (country || "DE").trim().toUpperCase();
  const isEu = EU_COUNTRIES.has(code);
  const reverseCharge =
    isEu &&
    vatId.trim().length > 3 &&
    REVERSE_CHARGE_PLANS.has((plan.code || "").trim().toLowerCase());
  const taxable = code === "DE" || (isEu && !reverseCharge);
  const vatCents = taxable ? Math.round(netCents * VAT_RATE) : 0;
  return { netCents, vatCents, grossCents: netCents + vatCents, reverseCharge };
}

export const createAuthenticatedPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<SecureOrderResult> => {
    const input = data as CreatePlanOrderInput;
    if (!input?.planId || !input.companyName?.trim() || !input.email?.trim() || !input.addressLine?.trim()) {
      throw new Error("Bitte Firma, E-Mail und Adresse ausfüllen.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      throw new Error("Bitte eine gültige E-Mail-Adresse angeben.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id,code,name,price_monthly_cents,price_yearly_cents,active")
      .eq("id", input.planId)
      .eq("active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error("Das gewählte Paket ist nicht mehr verfügbar.");

    const totals = calculateTotals(plan, input.billingInterval, input.country, input.vatId);
    const orderNumber = `BEST-${new Date().getFullYear()}-${String(
      Math.floor(Math.random() * 100000),
    ).padStart(5, "0")}`;

    const { error } = await supabaseAdmin.from("plan_orders").insert({
      order_number: orderNumber,
      plan_id: plan.id,
      plan_code: plan.code,
      plan_name: plan.name,
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
    if (error) throw new Error(error.message);

    return { orderNumber, totals };
  });
