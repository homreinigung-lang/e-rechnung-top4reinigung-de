import { describe, expect, it } from "vitest";
import { assertQuoteDecisionAllowed, assertQuoteCompletionAllowed } from "./quote-decision-eligibility";

describe("quote decision eligibility", () => {
  it.each(["draft", "sent"])("allows undecided quote status %s", (status) => {
    expect(() => assertQuoteDecisionAllowed({ type: "quote", status })).not.toThrow();
  });

  it.each(["accepted", "declined", "paid", "cancelled"])("rejects decided quote status %s", (status) => {
    expect(() => assertQuoteDecisionAllowed({ type: "quote", status })).toThrow("Nur offene");
  });

  it("rejects invoices and orders", () => {
    for (const type of ["invoice", "order"]) {
      expect(() => assertQuoteDecisionAllowed({ type, status: "sent" })).toThrow("nur für Angebote");
    }
  });

  it("rejects storno quotes", () => {
    expect(() => assertQuoteDecisionAllowed({ type: "quote", status: "sent", is_storno: true })).toThrow("Nur offene");
  });
});

describe("quote completion eligibility", () => {
  it("allows completing accepted quotes", () => {
    expect(() => assertQuoteCompletionAllowed({ type: "quote", status: "accepted" })).not.toThrow();
  });

  it.each(["draft", "sent", "declined", "paid", "cancelled"])("rejects status %s", (status) => {
    expect(() => assertQuoteCompletionAllowed({ type: "quote", status })).toThrow("Nur angenommene");
  });

  it("rejects invoices, orders and storno quotes", () => {
    for (const type of ["invoice", "order"]) {
      expect(() => assertQuoteCompletionAllowed({ type, status: "accepted" })).toThrow("Nur angenommene");
    }
    expect(() => assertQuoteCompletionAllowed({ type: "quote", status: "accepted", is_storno: true })).toThrow("Nur angenommene");
  });
});
