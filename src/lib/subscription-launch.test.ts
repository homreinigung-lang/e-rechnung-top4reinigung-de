import { describe, expect, it } from "vitest";
import { calcTotals, extraEmployeeCents, monthlyPriceCents } from "./plan-orders";
import { subscriptionAllowsPath, type SubscriptionAccess } from "./subscriptions";

const basis = {
  id: "basis",
  code: "basis",
  name: "Basis",
  description: "",
  price_monthly_cents: 2999,
  price_yearly_cents: 29990,
  features: [],
  sort_order: 1,
  active: true,
};

const pro = {
  ...basis,
  id: "pro",
  code: "pro",
  name: "Pro",
  price_monthly_cents: 6999,
  price_yearly_cents: 69990,
};

const active = (plan: string): SubscriptionAccess => ({
  plan,
  status: "active",
  renewsOn: "2027-10-01",
  expired: false,
});

describe("launch subscription pricing", () => {
  it("uses the new Basis launch price", () => {
    expect(calcTotals(basis, "monthly", "DE", "", 1).netCents).toBe(2999);
    expect(calcTotals(basis, "yearly", "DE", "", 1).netCents).toBe(29990);
  });

  it("adds Pro employee surcharge after 20 employees", () => {
    expect(extraEmployeeCents("pro", 20)).toBe(0);
    expect(extraEmployeeCents("pro", 23)).toBe(750);
    expect(monthlyPriceCents(pro, 23)).toBe(7749);
    expect(calcTotals(pro, "yearly", "DE", "", 23).netCents).toBe(78990);
  });

  it("treats reverse charge as tax handling independent from the package", () => {
    const result = calcTotals(basis, "monthly", "AT", "ATU12345678", 1);
    expect(result.reverseCharge).toBe(true);
    expect(result.vatCents).toBe(0);
  });
});

describe("launch package access", () => {
  it("keeps Basis on core areas", () => {
    expect(subscriptionAllowsPath(active("basis"), "/dashboard")).toBe(true);
    expect(subscriptionAllowsPath(active("basis"), "/dokumente")).toBe(true);
    expect(subscriptionAllowsPath(active("basis"), "/kalkulation")).toBe(false);
    expect(subscriptionAllowsPath(active("basis"), "/meine-zeiten")).toBe(false);
    expect(subscriptionAllowsPath(active("basis"), "/projekte")).toBe(false);
  });

  it("gives Pro operational modules but not Enterprise projects", () => {
    expect(subscriptionAllowsPath(active("pro"), "/kalkulation")).toBe(true);
    expect(subscriptionAllowsPath(active("pro"), "/team")).toBe(true);
    expect(subscriptionAllowsPath(active("pro"), "/meine-zeiten")).toBe(true);
    expect(subscriptionAllowsPath(active("pro"), "/projekte")).toBe(false);
    expect(subscriptionAllowsPath(active("pro"), "/steuerberater")).toBe(false);
  });

  it("gives Enterprise all package areas", () => {
    expect(subscriptionAllowsPath(active("enterprise"), "/projekte")).toBe(true);
    expect(subscriptionAllowsPath(active("enterprise"), "/steuerberater")).toBe(true);
  });

  it("blocks expired trial from paid application areas", () => {
    const expiredTrial: SubscriptionAccess = {
      plan: "basis",
      status: "trial",
      renewsOn: "2026-01-01",
      expired: true,
    };
    expect(subscriptionAllowsPath(expiredTrial, "/dashboard")).toBe(false);
    expect(subscriptionAllowsPath(expiredTrial, "/mein-paket")).toBe(true);
    expect(subscriptionAllowsPath(expiredTrial, "/hilfe")).toBe(true);
  });

  it("keeps active trial open during the 60-day evaluation period", () => {
    const trial: SubscriptionAccess = {
      plan: "basis",
      status: "trial",
      renewsOn: "2026-12-01",
      expired: false,
    };
    expect(subscriptionAllowsPath(trial, "/projekte")).toBe(true);
    expect(subscriptionAllowsPath(trial, "/team")).toBe(true);
  });
});
