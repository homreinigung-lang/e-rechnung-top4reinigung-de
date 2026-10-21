import { describe, expect, it } from "vitest";
import { buildBieterfragen, buildLvReviewReport } from "./review-report";
import type { LvValidationIssue } from "./types";

const issue = (field: LvValidationIssue["field"]): LvValidationIssue => ({
  itemId: "a",
  field,
  level: "warning",
  message: "Angabe fehlt",
  hint: "Bitte prüfen",
});

describe("LV review and bidder questions", () => {
  it("summarizes validation issues", () => {
    expect(buildLvReviewReport([issue("quantity")])).toContain("Hinweise: 1");
  });

  it("does not ask contracting authority for our own price", () => {
    const text = buildBieterfragen([issue("unit_price")], [{ id: "a", item_number: "2", source_page: 3 }]);
    expect(text).toContain("Keine automatisch vorgeschlagenen Fragen.");
    expect(text).not.toContain("Welche verbindliche Menge");
  });

  it("references position and page and avoids duplicate questions", () => {
    const text = buildBieterfragen([issue("quantity"), issue("quantity")], [{ id: "a", item_number: "2", source_page: 3 }]);
    expect(text).toContain("Position 2, Seite 3");
    expect(text.match(/Welche verbindliche Menge/g)).toHaveLength(1);
  });
});
