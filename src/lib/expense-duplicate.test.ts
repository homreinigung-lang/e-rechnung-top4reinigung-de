import { describe, expect, it } from "vitest";
import { findDuplicateExpense } from "./expense-duplicate";

const rows = [
  {
    id: "1",
    supplier: "Deutsche Rentenversicherung Knappschaft-Bahn-See",
    expense_date: "2026-09-28",
    document_number: "0556443402 OB-69899288",
    gross_amount: 175.9,
  },
];

describe("duplicate expense protection", () => {
  it("detects the same supplier and document number despite casing and spaces", () => {
    expect(
      findDuplicateExpense(
        {
          supplier: " deutsche rentenversicherung   knappschaft-bahn-see ",
          expense_date: "2026-10-01",
          document_number: "0556443402  OB-69899288",
          net_amount: 999,
          vat_amount: 0,
        },
        rows,
      )?.id,
    ).toBe("1");
  });

  it("detects same supplier, date and exact gross amount if no document number is available", () => {
    expect(
      findDuplicateExpense(
        {
          supplier: "Deutsche Rentenversicherung Knappschaft-Bahn-See",
          expense_date: "2026-09-28",
          document_number: "",
          net_amount: "175.90",
          vat_amount: "0.00",
        },
        rows,
      )?.id,
    ).toBe("1");
  });

  it("does not flag a different amount on the same date without a document number", () => {
    expect(
      findDuplicateExpense(
        {
          supplier: "Deutsche Rentenversicherung Knappschaft-Bahn-See",
          expense_date: "2026-09-28",
          document_number: "",
          net_amount: "176.90",
          vat_amount: "0.00",
        },
        rows,
      ),
    ).toBeNull();
  });

  it("does not flag an unrelated supplier even when date and amount match", () => {
    expect(
      findDuplicateExpense(
        {
          supplier: "Andere Firma GmbH",
          expense_date: "2026-09-28",
          document_number: "",
          net_amount: "175.90",
          vat_amount: "0.00",
        },
        rows,
      ),
    ).toBeNull();
  });
});
