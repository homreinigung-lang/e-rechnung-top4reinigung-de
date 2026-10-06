import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createAuthenticatedPlanOrder } from "./plan-orders.functions";
import { handleStripeWebhook } from "./stripe-billing.server";

// Synthetic local integration: real order/Checkout/webhook logic, in-memory DB and Stripe transport.
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { synthetic: true },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator = (input: unknown) => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validator) => {
        validator = fn;
        return builder;
      },
      handler:
        (fn: (args: { data: unknown; context: { userId: string } }) => unknown) =>
        (input: { data: unknown }) =>
          fn({ data: validator(input.data), context: { userId: "synthetic-owner" } }),
    };
    return builder;
  },
}));
const fixture = vi.hoisted(() => ({
  plan: {} as Record<string, unknown>,
  subscription: {} as Record<string, unknown>,
  orders: [] as Record<string, unknown>[],
  employees: 0,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      let patch: Record<string, unknown> | undefined;
      const run = () => {
        const rows =
          table === "plans"
            ? [fixture.plan]
            : table === "subscriptions"
              ? [fixture.subscription]
              : fixture.orders;
        const matches = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
        if (patch) matches.forEach((row) => Object.assign(row, patch));
        return { data: matches[0] ?? null, error: null, count: fixture.employees };
      };
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return chain;
        },
        maybeSingle: async () => run(),
        single: async () => run(),
        or: () => chain,
        insert: async (row: Record<string, unknown>) => {
          fixture.orders.push({ ...row });
          return { error: null };
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return chain;
        },
        then: (resolve: (value: ReturnType<typeof run>) => unknown) =>
          Promise.resolve(run()).then(resolve),
      };
      return chain;
    },
  },
}));
const planId = "11111111-1111-4111-8111-111111111111";
const orderInput = {
  planId,
  billingInterval: "monthly" as const,
  companyName: "SYNTHETIC TEST",
  contactName: "Test",
  email: "test@example.invalid",
  phone: "",
  addressLine: "Teststraße 1",
  postalCode: "00000",
  city: "Test",
  country: "DE",
  vatId: "",
  note: "LOCAL SYNTHETIC TEST",
};
const response = (value: unknown) => new Response(JSON.stringify(value));
let sentParams: URLSearchParams;
let remoteStatus: string;
let checkoutRequests: Map<string, string>;
beforeEach(() => {
  vi.stubEnv("STRIPE_BILLING_MODE", "");
  vi.stubEnv("STRIPE_LIVE_ENABLED", "false");
  checkoutRequests = new Map();
  fixture.plan = {
    id: planId,
    code: "basis",
    name: "Basis",
    price_monthly_cents: 2999,
    price_yearly_cents: 29990,
    active: true,
  };
  fixture.subscription = {
    id: "local-sub",
    user_id: "synthetic-owner",
    status: "inactive",
    renews_on: null,
  };
  fixture.orders = [];
  fixture.employees = 0;
  remoteStatus = "active";
  vi.stubEnv("STRIPE_SANDBOX_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("PUBLIC_SITE_URL", "https://isolated.example.invalid");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:59999");
  vi.stubEnv("STRIPE_SANDBOX_TAX_RATE_ID", "txr_test");
  const amounts: Record<string, number> = {
    basis_monthly: 2999,
    basis_yearly: 29990,
    pro_monthly: 6999,
    pro_yearly: 69990,
    enterprise_monthly: 13000,
    enterprise_yearly: 130000,
  };
  vi.stubEnv(
    "STRIPE_SANDBOX_PRICES",
    JSON.stringify(
      Object.fromEntries(
        Object.keys(amounts).map((key) => [key, `price_${key.replaceAll("_", "")}`]),
      ),
    ),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/prices/")) {
        const key = Object.keys(amounts).find((key) =>
          url.endsWith(`price_${key.replaceAll("_", "")}`),
        )!;
        return response({
          active: true,
          livemode: false,
          currency: "eur",
          unit_amount: amounts[key],
          tax_behavior: "exclusive",
          product: "prod_synthetic",
          recurring: { interval: key.endsWith("yearly") ? "year" : "month" },
        });
      }
      if (url.includes("/tax_rates/"))
        return response({ active: true, livemode: false, percentage: 19, inclusive: false });
      if (url.endsWith("/checkout/sessions")) {
        sentParams = init!.body as URLSearchParams;
        const key = new Headers(init?.headers).get("Idempotency-Key")!;
        const previous = checkoutRequests.get(key);
        if (previous && previous !== sentParams.toString()) {
          return new Response(
            JSON.stringify({ error: { message: "Checkout already in progress" } }),
            { status: 409 },
          );
        }
        checkoutRequests.set(key, sentParams.toString());
        return response({ id: "cs_synthetic", url: "https://checkout.stripe.com/test/synthetic" });
      }
      if (url.includes("/subscriptions/sub_synthetic?"))
        return response({
          id: "sub_synthetic",
          status: remoteStatus,
          latest_invoice: { status: "paid" },
          customer: "cus_synthetic",
          metadata: Object.fromEntries(
            ["user_id", "subscription_id", "plan_code", "billing_interval"].map((key) => [
              key,
              sentParams.get(`subscription_data[metadata][${key}]`),
            ]),
          ),
        });
      throw new Error(`Unexpected synthetic transport: ${url}`);
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("prevents two Checkout sessions before the first webhook arrives", async () => {
  vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
  await createAuthenticatedPlanOrder({ data: { ...orderInput, paymentMethod: "stripe" } });
  await expect(
    createAuthenticatedPlanOrder({ data: { ...orderInput, paymentMethod: "stripe" } }),
  ).rejects.toThrow("already in progress");
  expect(checkoutRequests.size).toBe(1);
  expect(fixture.orders).toHaveLength(1);
});
async function deliver(type: string, object: unknown) {
  const payload = JSON.stringify({ type, livemode: false, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", "whsec_synthetic")
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return handleStripeWebhook(
    new Request("http://localhost/api/public/stripe-webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    }),
  );
}
it.each([
  ["basis", "monthly", 2999, 29990],
  ["basis", "yearly", 2999, 29990],
  ["pro", "monthly", 6999, 69990],
  ["pro", "yearly", 6999, 69990],
  ["enterprise", "monthly", 13000, 130000],
  ["enterprise", "yearly", 13000, 130000],
] as const)(
  "completes the local %s/%s order to paid subscription flow",
  async (code, interval, monthly, yearly) => {
    Object.assign(fixture.plan, {
      code,
      name: code,
      price_monthly_cents: monthly,
      price_yearly_cents: yearly,
    });
    const result = await createAuthenticatedPlanOrder({
      data: { ...orderInput, billingInterval: interval, paymentMethod: "stripe" },
    });
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/test/synthetic");
    expect(result.totals.netCents).toBe(interval === "yearly" ? yearly : monthly);
    expect(fixture.orders).toHaveLength(1);
    expect(fixture.orders[0]).toMatchObject({
      customer_user_id: "synthetic-owner",
      payment_status: "pending",
      stripe_checkout_session_id: "cs_synthetic",
    });
    await deliver("checkout.session.completed", {
      id: "cs_synthetic",
      subscription: "sub_synthetic",
      metadata: {
        order_number: result.orderNumber,
        user_id: "synthetic-owner",
        subscription_id: "local-sub",
      },
    });
    await deliver("invoice.paid", {
      parent: { subscription_details: { subscription: "sub_synthetic" } },
    });
    expect(fixture.subscription).toMatchObject({
      status: "active",
      stripe_subscription_id: "sub_synthetic",
      plan: code,
      billing_interval: interval,
    });
    await deliver("invoice.paid", { subscription: "sub_synthetic" });
    expect(fixture.orders).toHaveLength(1);
    remoteStatus = "canceled";
    await deliver("customer.subscription.deleted", { id: "sub_synthetic" });
    expect(fixture.subscription["status"]).toBe("inactive");
    await deliver("invoice.paid", { subscription: "sub_synthetic" });
    expect(fixture.subscription["status"]).toBe("inactive");
  },
);
it("preserves the invoice flow with Stripe disabled and never calls Stripe", async () => {
  vi.stubEnv("STRIPE_SANDBOX_ENABLED", "false");
  const result = await createAuthenticatedPlanOrder({ data: orderInput });
  expect(result.checkoutUrl).toBeUndefined();
  expect(fixture.orders).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not create an order if online payment configuration is missing", async () => {
  vi.stubEnv("STRIPE_SANDBOX_PRICES", "{}");
  await expect(
    createAuthenticatedPlanOrder({ data: { ...orderInput, paymentMethod: "stripe" } }),
  ).rejects.toThrow("Preis fehlt");
  expect(fixture.orders).toHaveLength(0);
});
it("rejects another online subscription before contacting Stripe", async () => {
  fixture.subscription["stripe_subscription_id"] = "sub_existing";
  await expect(
    createAuthenticatedPlanOrder({ data: { ...orderInput, paymentMethod: "stripe" } }),
  ).rejects.toThrow("besteht bereits");
  expect(fixture.orders).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects an inactive plan", async () => {
  fixture.plan["active"] = false;
  await expect(createAuthenticatedPlanOrder({ data: orderInput })).rejects.toThrow(
    "nicht mehr verfügbar",
  );
  expect(fixture.orders).toHaveLength(0);
});
