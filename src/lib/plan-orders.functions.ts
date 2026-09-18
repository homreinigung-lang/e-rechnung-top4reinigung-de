import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: z.string().uuid(),
        billingInterval: z.enum(["monthly", "yearly"]),
        companyName: z.string().trim().min(1).max(200),
        contactName: z.string().trim().max(200),
        email: z.string().trim().email().max(200),
        phone: z.string().trim().max(80),
        addressLine: z.string().trim().min(1).max(250),
        postalCode: z.string().trim().max(40),
        city: z.string().trim().max(120),
        country: z.string().trim().min(2).max(2).transform((v) => v.toUpperCase()),
        vatId: z.string().trim().max(50),
        note: z.string().trim().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SecureOrderResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id,code,name,price_monthly_cents,price_yearly_cents,active")
      .eq("id", data.planId)
      .eq("active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error("Das gewählte Paket ist nicht mehr verfügbar.");

    const totals = calculateTotals(plan, data.billingInterval, data.country, data.vatId);
    const orderNumber = `BEST-${new Date().getFullYear()}-${String(
      Math.floor(Math.random() * 100000),
    ).padStart(5, "0")}`;

    const { error } = await supabaseAdmin.from("plan_orders").insert({
      order_number: orderNumber,
      plan_id: plan.id,
      plan_code: plan.code,
      plan_name: plan.name,
      billing_interval: data.billingInterval,
      company_name: data.companyName,
      contact_name: data.contactName,
      email: data.email,
      phone: data.phone,
      address_line: data.addressLine,
      postal_code: data.postalCode,
      city: data.city,
      country: data.country,
      vat_id: data.vatId,
      note: data.note,
      net_cents: totals.netCents,
      vat_cents: totals.vatCents,
      gross_cents: totals.grossCents,
      reverse_charge: totals.reverseCharge,
    });
    if (error) throw new Error(error.message);

    return { orderNumber, totals };
  });
