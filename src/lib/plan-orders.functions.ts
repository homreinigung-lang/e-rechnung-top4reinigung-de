import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VAT_RATE = 0.19;
export const getStripeBillingAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { stripeCheckoutAvailable } = await import("@/lib/stripe-billing.server");
    return stripeCheckoutAvailable();
  });
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

export type SecureOrderResult = {
  orderNumber: string;
  checkoutUrl?: string;
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
  employeeCount: number,
) {
  const includedEmployees = 20;
  const extraEmployeeCents = 250;
  const extraCount =
    (plan.code || "").trim().toLowerCase() === "pro"
      ? Math.max(0, employeeCount - includedEmployees)
      : 0;
  const surchargeMonthly = extraCount * extraEmployeeCents;
  const netCents =
    billingInterval === "yearly"
      ? plan.price_yearly_cents + surchargeMonthly * 12
      : plan.price_monthly_cents + surchargeMonthly;
  const code = (country || "DE").trim().toUpperCase();
  const isEu = EU_COUNTRIES.has(code);
  const reverseCharge = isEu && vatId.trim().length > 3;
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
        country: z
          .string()
          .trim()
          .min(2)
          .max(2)
          .transform((v) => v.toUpperCase()),
        vatId: z.string().trim().max(50),
        note: z.string().trim().max(2000),
        paymentMethod: z.enum(["invoice", "stripe"]).default("invoice"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SecureOrderResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id,code,name,price_monthly_cents,price_yearly_cents,active")
      .eq("id", data.planId)
      .eq("active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error("Das gewählte Paket ist nicht mehr verfügbar.");

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,user_id,status,renews_on")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (subscriptionError) throw new Error(subscriptionError.message);
    if (!subscription) throw new Error("Für dieses Firmenkonto ist kein Abonnement hinterlegt.");

    const { count: employeeCount, error: employeeCountError } = await supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("active", true);
    if (employeeCountError) throw new Error(employeeCountError.message);

    const safeEmployeeCount = employeeCount ?? 0;
    const totals = calculateTotals(
      plan,
      data.billingInterval,
      data.country,
      data.vatId,
      safeEmployeeCount,
    );
    const orderNumber = `BEST-${new Date().getFullYear()}-${crypto.randomUUID()}`;

    let order: Record<string, unknown> = {
      order_number: orderNumber,
      customer_user_id: context.userId,
      subscription_id: subscription.id,
      employee_count: safeEmployeeCount,
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
    };

    // Reserve an immutable payment attempt; create the order only after Checkout succeeds.
    let checkout: { id: string; url: string } | null = null;
    if (data.paymentMethod === "stripe") {
      const { data: billing, error: billingError } = await supabaseAdmin
        .from("subscriptions")
        .select("*")
        .eq("id", subscription.id)
        .eq("user_id", context.userId)
        .single();
      if (billingError) throw new Error(billingError.message);
      if ((billing as unknown as { stripe_subscription_id?: string }).stripe_subscription_id) {
        throw new Error(
          "Ein Online-Abonnement besteht bereits. Bitte den Support für einen Paketwechsel kontaktieren.",
        );
      }
      const { managedStripeCheckout } = await import("@/lib/stripe-checkout-attempt.server");
      const managed = await managedStripeCheckout(
        {
          orderNumber,
          userId: context.userId,
          subscriptionId: subscription.id,
          planCode: plan.code,
          planName: plan.name,
          billingInterval: data.billingInterval,
          ...totals,
          baseNetCents:
            data.billingInterval === "yearly" ? plan.price_yearly_cents : plan.price_monthly_cents,
          email: data.email,
          companyName: data.companyName,
          trialEndsOn: subscription.status === "trial" ? subscription.renews_on : null,
        },
        order,
      );
      checkout = managed.checkout;
      order = managed.order;
      if (!checkout)
        throw new Error("Online-Zahlung ist noch nicht verfügbar. Bitte Rechnung wählen.");
    }

    // A repeated request must not create another order or reset a webhook's status.
    if (checkout) {
      const { data: existing, error: lookupError } = await supabaseAdmin
        .from("plan_orders")
        .select("id")
        .eq("stripe_checkout_session_id", checkout.id)
        .eq("customer_user_id", context.userId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing)
        return {
          orderNumber: String(order["order_number"]),
          totals: {
            netCents: Number(order["net_cents"]),
            vatCents: Number(order["vat_cents"]),
            grossCents: Number(order["gross_cents"]),
            reverseCharge: Boolean(order["reverse_charge"]),
          },
          checkoutUrl: checkout.url,
        };
    }
    const { error } = await supabaseAdmin
      .from("plan_orders")
      .insert({
        ...order,
        ...(checkout ? { stripe_checkout_session_id: checkout.id, payment_status: "pending" } : {}),
      } as never);
    if (error) {
      if (!checkout || error.code !== "23505") throw new Error(error.message);
      const { data: concurrent, error: lookupError } = await supabaseAdmin
        .from("plan_orders")
        .select("id")
        .eq("stripe_checkout_session_id", checkout.id)
        .eq("customer_user_id", context.userId)
        .maybeSingle();
      if (lookupError || !concurrent) throw new Error(error.message);
    }

    return {
      orderNumber: String(order["order_number"]),
      totals: {
        netCents: Number(order["net_cents"]),
        vatCents: Number(order["vat_cents"]),
        grossCents: Number(order["gross_cents"]),
        reverseCharge: Boolean(order["reverse_charge"]),
      },
      ...(checkout ? { checkoutUrl: checkout.url } : {}),
    };
  });
