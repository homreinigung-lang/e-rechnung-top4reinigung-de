import { describe, expect, it } from "vitest";
import { buildDatevReviewCsv } from "./datev-review";

describe("DATEV review CSV (not an EXTF booking batch)", () => {
  it("includes flagged invoices and expenses without silently excluding them", () => {
    const csv = buildDatevReviewCsv({
      settings: null,
      invoices: [{ preparation_status: "REVIEW_EU_REVERSE_CHARGE", number: "R-1", total: 119 }],
      expenses: [{ preparation_status: "REVIEW_INPUT_VAT_AND_ACCOUNT", document_number: "E-1" }],
    });
    expect(csv).toContain("REVIEW_EU_REVERSE_CHARGE");
    expect(csv).toContain("REVIEW_INPUT_VAT_AND_ACCOUNT");
    expect(csv).toContain("R-1");
    expect(csv).toContain("E-1");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
  });

  it("escapes spreadsheet formulas, semicolons and quotes", () => {
    const csv = buildDatevReviewCsv({
      settings: null,
      invoices: [],
      expenses: [{ supplier: '=HYPERLINK("evil";"click")' }],
    });
    expect(csv).toContain('""evil"";""click""');
    expect(csv).toContain('"\'=HYPERLINK');
  });
});
