import "@tanstack/react-start/server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type StripeCheckoutInput = {
  orderNumber: string;
  userId: string;
  subscriptionId: string;
  planCode: string;
  planName: string;
  billingInterval: "monthly" | "yearly";
  grossCents: number;
  email: string;
  companyName: string;
  trialEndsOn?: string | null;
};

type StripeCheckoutResult = {
  id: string;
  url: string;
};

type StripeSubscription = {
  id: string;
  customer?: string | null;
  status?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
};

const stripeApi = "https://api.stripe.com/v1";

function stripeSecret(): string | null {
  return process.env["STRIPE_SECRET_KEY"]?.trim() || null;
}

function siteUrl(): string {
  return (process.env["PUBLIC_SITE_URL"] || "https://e-rechnung.top4reinigung.de").replace(/\/$/, "");
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe ist noch nicht konfiguriert.");
  const response = await fetch(`${stripeApi}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error?.message || `Stripe HTTP ${response.status}`);
  }
  return body;
}

export async function createStripeSubscriptionCheckout(
  input: StripeCheckoutInput,
): Promise<StripeCheckoutResult | null> {
  if (!stripeSecret()) return null;

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `${siteUrl()}/mein-paket?payment=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${siteUrl()}/mein-paket?payment=cancelled`);
  params.set("customer_email", input.email);
  params.set("client_reference_id", input.orderNumber);
  params.set("payment_method_types[0]", "card");
  params.set("payment_method_types[1]", "sepa_debit");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "eur");
  params.set("line_items[0][price_data][unit_amount]", String(input.grossCents));
  params.set("line_items[0][price_data][product_data][name]", `GebCalc ${input.planName}`);
  params.set(
    "line_items[0][price_data][product_data][description]",
    `${input.billingInterval === "yearly" ? "Jahres" : "Monats"}abonnement · ${input.companyName}`,
  );
  params.set(
    "line_items[0][price_data][recurring][interval]",
    input.billingInterval === "yearly" ? "year" : "month",
  );

  const metadata: Record<string, string> = {
    order_number: input.orderNumber,
    user_id: input.userId,
    subscription_id: input.subscriptionId,
    plan_code: input.planCode,
    billing_interval: input.billingInterval,
  };
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
    params.set(`subscription_data[metadata][${key}]`, value);
  }

  if (input.trialEndsOn) {
    const trialEnd = Math.floor(new Date(`${input.trialEndsOn}T23:59:59Z`).getTime() / 1000);
    const minimum = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
    if (Number.isFinite(trialEnd) && trialEnd >= minimum) {
      params.set("subscription_data[trial_end]", String(trialEnd));
    }
  }

  const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!session.url) throw new Error("Stripe hat keine Checkout-URL geliefert.");
  return { id: session.id, url: session.url };
}

function isoDateFromUnix(seconds?: number): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function retrieveSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

async function applyStripeSubscription(subscription: StripeSubscription, forceStatus?: string) {
  const metadata = subscription.metadata ?? {};
  const localSubscriptionId = metadata["subscription_id"];
  const userId = metadata["user_id"];
  if (!localSubscriptionId && !userId) return;

  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer ?? null,
    stripe_status: forceStatus ?? subscription.status ?? null,
    updated_at: new Date().toISOString(),
  };
  const planCode = metadata["plan_code"];
  if (planCode) patch["plan"] = planCode;
  const interval = metadata["billing_interval"];
  if (interval) patch["billing_interval"] = interval;
  const renewsOn = isoDateFromUnix(subscription.current_period_end);
  if (renewsOn) patch["renews_on"] = renewsOn;

  const effectiveStatus = forceStatus ?? subscription.status ?? "";
  if (["active", "trialing"].includes(effectiveStatus)) patch["status"] = "active";
  if (["canceled", "unpaid", "incomplete_expired"].includes(effectiveStatus)) patch["status"] = "inactive";

  let query = supabaseAdmin.from("subscriptions").update(patch as never);
  query = localSubscriptionId
    ? query.eq("id", localSubscriptionId)
    : query.eq("user_id", userId!);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > 300) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return signatures.some((signature) => timingSafeEqualHex(signature, expected));
}

export async function handleStripeWebhook(request: Request): Promise<Response> {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  if (!webhookSecret) return new Response("Stripe webhook is not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature") ?? "";
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, signature, webhookSecret))) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const stripeSubscriptionId = typeof object["subscription"] === "string" ? object["subscription"] : null;
    const metadata = (object["metadata"] ?? {}) as Record<string, string>;
    const orderNumber = metadata["order_number"];
    if (orderNumber) {
      await supabaseAdmin
        .from("plan_orders")
        .update({ payment_status: "checkout_completed", stripe_checkout_session_id: object["id"] } as never)
        .eq("order_number", orderNumber);
    }
    if (stripeSubscriptionId) await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId));
  }

  if (event.type === "invoice.paid") {
    const stripeSubscriptionId = typeof object["subscription"] === "string" ? object["subscription"] : null;
    if (stripeSubscriptionId) await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId), "active");
  }

  if (event.type === "invoice.payment_failed") {
    const stripeSubscriptionId = typeof object["subscription"] === "string" ? object["subscription"] : null;
    if (stripeSubscriptionId) await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId), "past_due");
  }

  if (event.type === "customer.subscription.deleted") {
    const id = typeof object["id"] === "string" ? object["id"] : null;
    if (id) await applyStripeSubscription(object as unknown as StripeSubscription, "canceled");
  }

  return new Response("ok", { status: 200 });
}
