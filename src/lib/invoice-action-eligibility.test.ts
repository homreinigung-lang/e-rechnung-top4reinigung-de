import { describe, expect, it } from "vitest";
import { assertInvoiceActionAllowed } from "./invoice-action-eligibility";

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
