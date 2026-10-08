import "@tanstack/react-start/server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StripeCheckoutInput = {
  orderNumber: string;
  userId: string;
  subscriptionId: string;
  planCode: string;
  planName: string;
  billingInterval: "monthly" | "yearly";
  grossCents: number;
  netCents: number;
  baseNetCents: number;
  vatCents: number;
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
  items?: { data?: { current_period_end?: number }[] };
  latest_invoice?: { status?: string } | string | null;
  metadata?: Record<string, string>;
};

const stripeApi = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2026-09-30.endive";

export function stripeBillingMode(): "off" | "sandbox" | "live" {
  const configured = process.env["STRIPE_BILLING_MODE"]?.trim();
  if (configured === "live") return process.env["STRIPE_LIVE_ENABLED"] === "true" ? "live" : "off";
  if (configured === "sandbox") return "sandbox";
  if (configured) return "off";
  return process.env["STRIPE_SANDBOX_ENABLED"] === "true" ? "sandbox" : "off";
}

export function stripeSandboxEnabled(): boolean {
  return stripeBillingMode() === "sandbox";
}

export function stripeCheckoutAvailable(): boolean {
  try {
    if (!stripeSecret() || !process.env["STRIPE_WEBHOOK_SECRET"]?.startsWith("whsec_"))
      return false;
    const mode = stripeBillingMode();
    const mapping = JSON.parse(
      process.env[mode === "live" ? "STRIPE_LIVE_PRICES" : "STRIPE_SANDBOX_PRICES"] || "{}",
    );
    const rate =
      process.env[mode === "live" ? "STRIPE_LIVE_TAX_RATE_ID" : "STRIPE_SANDBOX_TAX_RATE_ID"];
    return Boolean(
      rate &&
      /^txr_[a-zA-Z0-9]+$/.test(rate) &&
      mapping &&
      ["basis", "pro", "enterprise"].every((plan) =>
        ["monthly", "yearly"].every((interval) =>
          /^price_[a-zA-Z0-9]+$/.test(mapping[`${plan}_${interval}`] || ""),
        ),
      ),
    );
  } catch {
    return false;
  }
}

function stripeSecret(): string | null {
  const mode = stripeBillingMode();
  if (mode === "off") return null;
  if (
    mode === "sandbox" &&
    (process.env["SUPABASE_URL"] || "").includes("squkjqvofugkanzuqtqn.supabase.co")
  ) {
    throw new Error("Stripe Sandbox darf keine Produktionsdaten ändern.");
  }
  const secret = process.env["STRIPE_SECRET_KEY"]?.trim();
  const prefix = mode === "live" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/;
  if (!secret || !prefix.test(secret))
    throw new Error(
      mode === "live"
        ? "Stripe Live benötigt einen Live-Schlüssel."
        : "Stripe Sandbox benötigt einen Testschlüssel.",
    );
  const site = new URL(siteUrl());
  if (mode === "sandbox" && site.hostname === "e-rechnung.top4reinigung.de") {
    throw new Error("Stripe Sandbox benötigt eine separate Testumgebung.");
  }
  if (
    mode === "live" &&
    (site.protocol !== "https:" ||
      !process.env["PUBLIC_SITE_URL"] ||
      !/^acct_[a-zA-Z0-9]+$/.test(process.env["STRIPE_LIVE_ACCOUNT_ID"] || ""))
  ) {
    throw new Error("Stripe Live benötigt eine HTTPS-Website und eine bestätigte Konto-ID.");
  }
  return secret;
}

function siteUrl(): string {
  return (process.env["PUBLIC_SITE_URL"] || "https://e-rechnung.top4reinigung.de").replace(
    /\/$/,
    "",
  );
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = stripeSecret();
  if (!secret) throw new Error("Stripe ist noch nicht konfiguriert.");
  const response = await fetch(`${stripeApi}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error?.message || `Stripe HTTP ${response.status}`);
  }
  return body;
}

async function verifyLiveAccount(requireReady: boolean): Promise<void> {
  if (stripeBillingMode() !== "live") return;
  const account = await stripeRequest<{
    id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  }>("/account");
  if (
    account.id !== process.env["STRIPE_LIVE_ACCOUNT_ID"] ||
    (requireReady && (!account.charges_enabled || !account.payouts_enabled))
  ) {
    throw new Error("Stripe Live-Konto ist nicht vollständig aktiviert oder stimmt nicht überein.");
  }
}

export async function createStripeSubscriptionCheckout(
  input: StripeCheckoutInput,
): Promise<StripeCheckoutResult | null> {
  if (!stripeSecret()) return null;
  const mode = stripeBillingMode();
  await verifyLiveAccount(true);
  let prices: Record<string, string>;
  try {
    prices = JSON.parse(
      process.env[mode === "live" ? "STRIPE_LIVE_PRICES" : "STRIPE_SANDBOX_PRICES"] || "{}",
    );
    if (!prices || typeof prices !== "object" || Array.isArray(prices))
      throw new Error("Invalid mapping");
  } catch {
    throw new Error("Stripe-Preiskonfiguration ist ungültig.");
  }
  const priceId = prices[`${input.planCode}_${input.billingInterval}`];
  if (!priceId || !/^price_[a-zA-Z0-9]+$/.test(priceId))
    throw new Error("Stripe-Preis fehlt für dieses Paket.");
  const price = await stripeRequest<{
    active: boolean;
    livemode: boolean;
    currency: string;
    unit_amount: number;
    tax_behavior: string;
    product: string;
    recurring?: { interval: string };
  }>(`/prices/${encodeURIComponent(priceId)}`);
  const interval = input.billingInterval === "yearly" ? "year" : "month";
  if (
    !price.active ||
    price.livemode !== (mode === "live") ||
    price.currency !== "eur" ||
    price.tax_behavior !== "exclusive" ||
    price.recurring?.interval !== interval ||
    !Number.isSafeInteger(input.netCents) ||
    price.unit_amount !== input.baseNetCents ||
    !Number.isSafeInteger(input.vatCents) ||
    input.vatCents < 0 ||
    price.unit_amount > input.netCents ||
    price.unit_amount <= 0 ||
    input.grossCents !== input.netCents + input.vatCents
  ) {
    throw new Error("Stripe-Preis stimmt nicht mit der Bestellung überein.");
  }
  const surcharge = input.netCents - price.unit_amount;
  if (
    surcharge &&
    (input.planCode !== "pro" || surcharge % (interval === "year" ? 3000 : 250) !== 0)
  ) {
    throw new Error("Stripe-Preis stimmt nicht mit der Bestellung überein.");
  }
  let taxRateId: string | undefined;
  if (input.vatCents) {
    taxRateId =
      process.env[mode === "live" ? "STRIPE_LIVE_TAX_RATE_ID" : "STRIPE_SANDBOX_TAX_RATE_ID"];
    if (!taxRateId || !/^txr_[a-zA-Z0-9]+$/.test(taxRateId))
      throw new Error("Stripe-Steuersatz fehlt.");
    const rate = await stripeRequest<{
      active: boolean;
      livemode: boolean;
      percentage: number;
      inclusive: boolean;
    }>(`/tax_rates/${taxRateId}`);
    if (
      !rate.active ||
      rate.livemode !== (mode === "live") ||
      rate.inclusive ||
      rate.percentage !== 19 ||
      input.vatCents !== Math.round(input.netCents * 0.19)
    ) {
      throw new Error("Stripe-Steuersatz stimmt nicht mit der Bestellung überein.");
    }
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set(
    "success_url",
    `${siteUrl()}/mein-paket?payment=success&session_id={CHECKOUT_SESSION_ID}`,
  );
  params.set("cancel_url", `${siteUrl()}/mein-paket?payment=cancelled`);
  params.set("customer_email", input.email);
  params.set("client_reference_id", input.orderNumber);
  params.set("payment_method_types[0]", "card");
  params.set("payment_method_types[1]", "sepa_debit");
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price]", priceId);
  if (taxRateId) params.set("line_items[0][tax_rates][0]", taxRateId);
  if (surcharge) {
    params.set("line_items[1][quantity]", "1");
    params.set("line_items[1][price_data][currency]", "eur");
    params.set("line_items[1][price_data][unit_amount]", String(surcharge));
    params.set("line_items[1][price_data][product]", price.product);
    params.set("line_items[1][price_data][tax_behavior]", "exclusive");
    params.set("line_items[1][price_data][recurring][interval]", interval);
    if (taxRateId) params.set("line_items[1][tax_rates][0]", taxRateId);
  }

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
    const now = Math.floor(Date.now() / 1000);
    const minimum = now + 48 * 60 * 60;
    if (!Number.isFinite(trialEnd) || (trialEnd > now && trialEnd < minimum)) {
      throw new Error(
        "Die Testphase bleibt bestehen. Online-Zahlung bitte nach Ablauf erneut starten.",
      );
    }
    if (Number.isFinite(trialEnd) && trialEnd >= minimum) {
      params.set("subscription_data[trial_end]", String(trialEnd));
    }
  }

  // Retries of the same persisted attempt must use identical parameters.
  const checkoutDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${input.subscriptionId}:${input.orderNumber}`),
  );
  const checkoutKey = Array.from(new Uint8Array(checkoutDigest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `checkout-${checkoutKey}`,
    },
    body: params,
  });
  if (!session.url || !session.url.startsWith("https://checkout.stripe.com/"))
    throw new Error("Stripe hat keine gültige Checkout-URL geliefert.");
  return { id: session.id, url: session.url };
}

export async function retrieveStripeCheckout(id: string) {
  if (stripeBillingMode() === "off") throw new Error("Online-Zahlung ist noch nicht verfügbar.");
  await verifyLiveAccount(true);
  return stripeRequest<{
    id: string;
    status: "open" | "complete" | "expired";
    url?: string | null;
  }>(`/checkout/sessions/${encodeURIComponent(id)}`);
}

function isoDateFromUnix(seconds?: number): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function retrieveSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    `/subscriptions/${encodeURIComponent(id)}?expand[]=latest_invoice`,
  );
}

async function applyStripeSubscription(subscription: StripeSubscription) {
  const metadata = subscription.metadata ?? {};
  const localSubscriptionId = metadata["subscription_id"];
  const userId = metadata["user_id"];
  if (!localSubscriptionId || !userId) return;

  const patch: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer ?? null,
    stripe_status: subscription.status ?? null,
    updated_at: new Date().toISOString(),
  };
  const planCode = metadata["plan_code"];
  if (planCode) patch["plan"] = planCode;
  const interval = metadata["billing_interval"];
  if (interval) patch["billing_interval"] = interval;
  const renewsOn = isoDateFromUnix(
    subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end,
  );
  const effectiveStatus = subscription.status ?? "";
  const paidActive =
    effectiveStatus === "active" &&
    typeof subscription.latest_invoice === "object" &&
    subscription.latest_invoice?.status === "paid";
  // Never leave previously granted access active when payment is no longer valid.
  const entitled = paidActive || effectiveStatus === "trialing";
  patch["status"] = paidActive ? "active" : effectiveStatus === "trialing" ? "trial" : "inactive";
  if (entitled && renewsOn) patch["renews_on"] = renewsOn;

  const query = supabaseAdmin
    .from("subscriptions")
    .update(patch as never)
    .eq("id", localSubscriptionId)
    .eq("user_id", userId)
    .or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${subscription.id}`);
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
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
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
  const mode = stripeBillingMode();
  if (mode === "off") return new Response("Stripe billing is disabled", { status: 503 });
  try {
    stripeSecret();
  } catch {
    return new Response("Invalid billing configuration", { status: 503 });
  }
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  if (!webhookSecret) return new Response("Stripe webhook is not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature") ?? "";
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, signature, webhookSecret))) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  let event: {
    livemode?: boolean;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  if (event.livemode !== (mode === "live"))
    return new Response("Stripe mode mismatch", { status: 400 });
  await verifyLiveAccount(false);
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed") {
    const stripeSubscriptionId =
      typeof object["subscription"] === "string" ? object["subscription"] : null;
    const metadata = (object["metadata"] ?? {}) as Record<string, string>;
    const orderNumber = metadata["order_number"];
    if (orderNumber) {
      const { error } = await supabaseAdmin
        .from("plan_orders")
        .update({
          payment_status: "checkout_completed",
          stripe_checkout_session_id: object["id"],
        } as never)
        .eq("order_number", orderNumber)
        .eq("customer_user_id", metadata["user_id"] || "")
        .eq("subscription_id", metadata["subscription_id"] || "");
      if (error) throw new Error(error.message);
    }
    if (stripeSubscriptionId)
      await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId));
  }

  if (event.type === "invoice.paid") {
    const stripeSubscriptionId = invoiceSubscriptionId(object);
    if (stripeSubscriptionId)
      await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId));
  }

  if (event.type === "invoice.payment_failed") {
    const stripeSubscriptionId = invoiceSubscriptionId(object);
    if (stripeSubscriptionId)
      await applyStripeSubscription(await retrieveSubscription(stripeSubscriptionId));
  }

  if (
    [
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "customer.subscription.created",
    ].includes(event.type || "")
  ) {
    const id = typeof object["id"] === "string" ? object["id"] : null;
    if (id) await applyStripeSubscription(await retrieveSubscription(id));
  }

  return new Response("ok", { status: 200 });
}

function invoiceSubscriptionId(object: Record<string, unknown>): string | null {
  if (typeof object["subscription"] === "string") return object["subscription"];
  const parent = object["parent"] as
    { subscription_details?: { subscription?: string } } | undefined;
  return typeof parent?.subscription_details?.subscription === "string"
    ? parent.subscription_details.subscription
    : null;
}
