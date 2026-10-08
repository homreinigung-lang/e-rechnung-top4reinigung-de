import { describe, expect, it } from "vitest";
import { escapeExcelHtml, excelHtmlCell } from "./excel-html";

describe("Excel HTML export safety", () => {
  it("escapes HTML markup, quotes and ampersands", () => {
    expect(escapeExcelHtml('<img src=x onerror="alert(1)">&\'')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;",
    );
    expect(excelHtmlCell("<script>alert(1)</script>")).toBe(
      "<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>",
    );
  });

  it("does not permit customer-supplied formulas, even after whitespace", () => {
    for (const value of ["=1+1", " +SUM(1,2)", "\t@SUM(A1:A2)", "-CMD|'/C calc'!A0"]) {
      const cell = excelHtmlCell(value);
      expect(cell).toContain("mso-number-format");
      expect(cell).toContain("&#39;");
    }
  });

  it("keeps ordinary numeric cells numeric", () => {
    expect(excelHtmlCell("-42,50")).toBe("<td>-42,50</td>");
    expect(excelHtmlCell("1.234,56")).toBe("<td>1.234,56</td>");
    expect(excelHtmlCell("Hallo")).toBe("<td>Hallo</td>");
  });
});
