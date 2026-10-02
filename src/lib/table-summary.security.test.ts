import { describe, expect, it } from "vitest";
import { buildCsvWithSummary } from "./table-summary";

describe("CSV export hardening", () => {
  it("neutralizes spreadsheet formulas while preserving ordinary negative numbers", () => {
    const csv = buildCsvWithSummary([
      { name: '=HYPERLINK("https://example.invalid")', amount: "-12,50", note: "+CMD" },
    ]);

    expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"")"`);
    expect(csv).toContain('"−12,50"'.replace("−", "-"));
    expect(csv).toContain('"\'+CMD"');
  });
});
