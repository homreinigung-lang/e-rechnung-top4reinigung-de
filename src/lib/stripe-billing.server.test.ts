import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createStripeSubscriptionCheckout, handleStripeWebhook } from "./stripe-billing.server";

vi.mock("@tanstack/react-start/server-only", () => ({}));
const db = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), or: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
const input = {
  orderNumber: "BEST-TEST-1",
  userId: "user-1",
  subscriptionId: "local-sub-1",
  planCode: "basis",
  planName: "Basis",
  billingInterval: "monthly" as const,
  netCents: 2999,
  baseNetCents: 2999,
  vatCents: 570,
  grossCents: 3569,
  email: "test@example.invalid",
  companyName: "TEST",
};
const price = {
  active: true,
  livemode: false,
  currency: "eur",
  unit_amount: 2999,
  tax_behavior: "exclusive",
  product: "prod_test",
  recurring: { interval: "month" },
};
const rate = { active: true, livemode: false, percentage: 19, inclusive: false };
const reply = (value: unknown) => new Response(JSON.stringify(value));
const subscription = {
  id: "sub_test",
  status: "active",
  latest_invoice: { status: "paid" },
  customer: "cus_test",
  metadata: {
    subscription_id: "local-sub-1",
    user_id: "user-1",
    plan_code: "basis",
    billing_interval: "monthly",
  },
  items: { data: [{ current_period_end: 1800000000 }] },
};

beforeEach(() => {
  vi.stubEnv("STRIPE_SANDBOX_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_synthetic");
  vi.stubEnv("PUBLIC_SITE_URL", "https://sandbox.example.invalid");
  vi.stubEnv("SUPABASE_URL", "https://isolated.example.invalid");
  vi.stubEnv("STRIPE_SANDBOX_TAX_RATE_ID", "txr_test");
  vi.stubEnv("STRIPE_SANDBOX_PRICES", JSON.stringify({ basis_monthly: "price_test" }));
  db.from.mockReturnValue(db);
  db.update.mockReturnValue(db);
  db.eq.mockReturnValue(db);
  db.or.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Sandbox Checkout", () => {
  it("uses the saved net price, recurring VAT, metadata and idempotency", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(price))
      .mockResolvedValueOnce(reply(rate))
      .mockResolvedValueOnce(
        reply({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/test" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await createStripeSubscriptionCheckout(input)).toMatchObject({ id: "cs_test" });
    const request = fetchMock.mock.calls[2]![1];
    const params = request.body as URLSearchParams;
    expect(params.get("line_items[0][price]")).toBe("price_test");
    expect(params.get("line_items[0][tax_rates][0]")).toBe("txr_test");
    expect(params.has("line_items[0][price_data][unit_amount]")).toBe(false);
    expect(params.get("subscription_data[metadata][user_id]")).toBe("user-1");
    expect(request.headers["Idempotency-Key"]).toMatch(/^checkout-[a-f0-9]{64}$/);
  });
  it("keeps invoice ordering available when Sandbox is disabled", async () => {
    vi.stubEnv("STRIPE_SANDBOX_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await createStripeSubscriptionCheckout(input)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["sk_live_fake", "", "rk_live_fake"])(
    "refuses non-test credentials %s",
    async (secret) => {
      vi.stubEnv("STRIPE_SECRET_KEY", secret);
      vi.stubGlobal("fetch", vi.fn());
      await expect(createStripeSubscriptionCheckout(input)).rejects.toThrow("Testschlüssel");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each(["site", "database"])("refuses the production %s", async (kind) => {
    vi.stubEnv(
      kind === "site" ? "PUBLIC_SITE_URL" : "SUPABASE_URL",
      kind === "site"
        ? "https://e-rechnung.top4reinigung.de"
        : "https://squkjqvofugkanzuqtqn.supabase.co",
    );
    await expect(createStripeSubscriptionCheckout(input)).rejects.toThrow();
  });
  it.each([
    { livemode: true },
    { active: false },
    { currency: "usd" },
    { tax_behavior: "inclusive" },
    { unit_amount: 3000 },
    { recurring: { interval: "year" } },
  ])("rejects mismatching saved price %j", async (patch) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...price, ...patch })));
    await expect(createStripeSubscriptionCheckout(input)).rejects.toThrow("Preis stimmt");
  });
  it("supports recurring Pro employee surcharges without changing the base price", async () => {
    vi.stubEnv("STRIPE_SANDBOX_PRICES", '{"pro_yearly":"price_pro"}');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ ...price, unit_amount: 69990, recurring: { interval: "year" } }),
      )
      .mockResolvedValueOnce(reply(rate))
      .mockResolvedValueOnce(reply({ id: "cs_test", url: "https://checkout.stripe.com/test" }));
    vi.stubGlobal("fetch", fetchMock);
    await createStripeSubscriptionCheckout({
      ...input,
      planCode: "pro",
      billingInterval: "yearly",
      netCents: 72990,
      baseNetCents: 69990,
      vatCents: 13868,
      grossCents: 86858,
    });
    const params = fetchMock.mock.calls[2]![1].body as URLSearchParams;
    expect(params.get("line_items[0][price]")).toBe("price_pro");
    expect(params.get("line_items[1][price_data][unit_amount]")).toBe("3000");
    expect(params.get("line_items[1][price_data][recurring][interval]")).toBe("year");
    expect(params.get("line_items[1][tax_rates][0]")).toBe("txr_test");
  });
  it("preserves a future trial and does not require a rate for VAT-free totals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(price))
      .mockResolvedValueOnce(reply({ id: "cs_test", url: "https://checkout.stripe.com/test" }));
    vi.stubGlobal("fetch", fetchMock);
    await createStripeSubscriptionCheckout({
      ...input,
      vatCents: 0,
      grossCents: 2999,
      trialEndsOn: "2099-01-01",
    });
    const params = fetchMock.mock.calls[1]![1].body as URLSearchParams;
    expect(params.has("subscription_data[trial_end]")).toBe(true);
    expect(params.has("line_items[0][tax_rates][0]")).toBe(false);
  });
  it("rejects an inclusive or incorrect VAT rate", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply(price))
        .mockResolvedValueOnce(reply({ ...rate, inclusive: true })),
    );
    await expect(createStripeSubscriptionCheckout(input)).rejects.toThrow("Steuersatz stimmt");
  });
});

function eventRequest(
  type: string,
  object: unknown,
  options: { live?: boolean; age?: number; bad?: boolean } = {},
) {
  const payload = JSON.stringify({ livemode: options.live ?? false, type, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000) - (options.age ?? 0);
  const signature = createHmac("sha256", "whsec_synthetic")
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return new Request("https://sandbox.example.invalid/api/public/stripe-webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": `t=${timestamp},v1=${options.bad ? "bad" : signature}` },
  });
}
describe("signed Sandbox webhooks", () => {
  it("does not activate before the latest invoice has been paid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply({ ...subscription, latest_invoice: { status: "open" } })),
    );
    await handleStripeWebhook(eventRequest("customer.subscription.updated", { id: "sub_test" }));
    expect(db.update.mock.calls[0]![0]).not.toHaveProperty("status");
  });
  it("keeps trialing subscriptions in the local trial state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply({ ...subscription, status: "trialing" })),
    );
    await handleStripeWebhook(eventRequest("customer.subscription.updated", { id: "sub_test" }));
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "trial" }));
  });
  it.each([{ bad: true }, { age: 301 }, { live: true }])(
    "rejects invalid or live events %j",
    async (options) => {
      expect(
        (
          await handleStripeWebhook(
            eventRequest("invoice.paid", { subscription: "sub_test" }, options),
          )
        ).status,
      ).toBe(400);
      expect(db.from).not.toHaveBeenCalled();
    },
  );
  it("reads modern invoice parents and item renewal dates, restricting both owner and ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(subscription)));
    expect(
      (
        await handleStripeWebhook(
          eventRequest("invoice.paid", {
            parent: { subscription_details: { subscription: "sub_test" } },
          }),
        )
      ).status,
    ).toBe(200);
    expect(db.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(db.eq).toHaveBeenCalledWith("id", "local-sub-1");
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", renews_on: "2027-01-15" }),
    );
  });
  it("does not reactivate a canceled subscription after a late invoice paid event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply({ ...subscription, status: "canceled" })),
    );
    await handleStripeWebhook(eventRequest("invoice.paid", { subscription: "sub_test" }));
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "inactive", stripe_status: "canceled" }),
    );
  });
  it("does not mutate rows if ownership metadata is incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply({ ...subscription, metadata: { user_id: "user-1" } })),
    );
    await handleStripeWebhook(eventRequest("customer.subscription.updated", { id: "sub_test" }));
    expect(db.from).not.toHaveBeenCalled();
  });
  it("surfaces database failures for Stripe retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(subscription)));
    db.or.mockResolvedValueOnce({ error: { message: "DB unavailable" } });
    await expect(
      handleStripeWebhook(eventRequest("invoice.paid", { subscription: "sub_test" })),
    ).rejects.toThrow("DB unavailable");
  });
});
