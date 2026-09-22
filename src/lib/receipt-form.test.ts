import { describe, expect, it } from "vitest";
import { receiptFormValues } from "./receipt-form";

const valid = {
  supplier: "Test GmbH",
  document_number: "TEST-1",
  expense_date: "2026-09-22",
  net_amount: 100,
  vat_amount: 19,
  gross_amount: 119,
  category: "Material",
  notes: "",
};

describe("receipt values before React state updates", () => {
  it("formats recognized values for the visible fields", () => {
    expect(receiptFormValues(valid)).toMatchObject({
      supplier: "Test GmbH",
      net_amount: "100.00",
      vat_amount: "19.00",
    });
  });
  it("replaces a previous VAT value with an explicitly recognized zero", () => {
    expect(receiptFormValues({ ...valid, vat_amount: 0, gross_amount: 100 }).vat_amount).toBe(
      "0.00",
    );
  });
  it.each([
    undefined,
    null,
    {},
    { ...valid, net_amount: undefined },
    { ...valid, net_amount: "100" },
    { ...valid, net_amount: NaN },
    { ...valid, net_amount: Infinity },
    { ...valid, net_amount: 0, vat_amount: 0, gross_amount: 0 },
    { ...valid, gross_amount: 999 },
  ])(
    "rejects unusable results before they can trigger success or a deferred render error: %j",
    (value) => {
      expect(() => receiptFormValues(value)).toThrow(
        "Die Belegdaten konnten nicht übernommen werden",
      );
    },
  );
});
