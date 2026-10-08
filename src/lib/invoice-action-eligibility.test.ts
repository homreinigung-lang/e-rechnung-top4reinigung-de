import { describe, expect, it } from "vitest";
import { assertInvoiceActionAllowed, assertInvoicePaymentReversible } from "./invoice-action-eligibility";

describe("invoice payment and reminder eligibility", () => {
  for (const action of ["payment", "reminder"] as const) {
    it(`rejects draft invoices for ${action}`, () => {
      expect(() =>
        assertInvoiceActionAllowed({ type: "invoice", status: "draft" }, action),
      ).toThrow("Entwürfe");
    });

    it(`rejects cancelled and storno invoices for ${action}`, () => {
      expect(() =>
        assertInvoiceActionAllowed({ type: "invoice", status: "cancelled" }, action),
      ).toThrow("Stornierte");
      expect(() =>
        assertInvoiceActionAllowed(
          { type: "invoice", status: "sent", is_storno: true },
          action,
        ),
      ).toThrow("Stornierte");
    });

    it(`rejects non-invoice documents for ${action}`, () => {
      expect(() =>
        assertInvoiceActionAllowed({ type: "quote", status: "sent" }, action),
      ).toThrow("nur für Rechnungen");
    });

    it(`rejects already paid invoices for ${action}`, () => {
      expect(() =>
        assertInvoiceActionAllowed({ type: "invoice", status: "paid" }, action),
      ).toThrow();
    });

    it(`allows issued and overdue invoices for ${action}`, () => {
      for (const status of ["sent", "overdue"]) {
        expect(() =>
          assertInvoiceActionAllowed({ type: "invoice", status }, action),
        ).not.toThrow();
      }
    });
  }
});

describe("invoice payment reversal eligibility", () => {
  it("allows reverting a paid, non-storno invoice", () => {
    expect(() =>
      assertInvoicePaymentReversible({ type: "invoice", status: "paid", is_storno: false }),
    ).not.toThrow();
  });

  it.each(["draft", "sent", "overdue", "cancelled"])(
    "rejects reversal when status is %s",
    (status) => {
      expect(() =>
        assertInvoicePaymentReversible({ type: "invoice", status }),
      ).toThrow("Nur bezahlte");
    },
  );

  it("rejects storno documents even if marked paid", () => {
    expect(() =>
      assertInvoicePaymentReversible({ type: "invoice", status: "paid", is_storno: true }),
    ).toThrow("Nur bezahlte");
  });

  it("rejects non-invoice documents even if marked paid", () => {
    expect(() =>
      assertInvoicePaymentReversible({ type: "quote", status: "paid" }),
    ).toThrow("Nur bezahlte");
  });
});
