import { describe, expect, it } from "vitest";
import {
  buildXRechnungXml,
  buildZugferdXml,
  validateERechnung,
  type ERechnungInput,
} from "@/lib/erechnung";

const valid: ERechnungInput = {
  doc: {
    issue_date: "2026-10-08",
    tax_mode: "regelbesteuerung",
    customer_company: "Musterkunde GmbH",
    customer_address_line: "Kundenweg 2",
    customer_postal_code: "66111",
    customer_city: "Saarbrücken",
  },
  items: [{ position: 1, description: "Reinigung", quantity: 1, unit: "Std", unit_price: 100 }],
  settings: {
    company_name: "Muster Reinigung",
    address_line: "Beispielstraße 1",
    postal_code: "66333",
    city: "Völklingen",
    tax_number: "123/456/78901",
  },
  netTotal: 100,
  vatAmount: 19,
  grossTotal: 119,
  vatRate: 19,
  number: "RE-2026-0001",
};

describe("E-Rechnung Pflichtdaten", () => {
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "invalid"])(
    "rejects an invalid calendar date: %s",
    (issue_date) => {
      expect(validateERechnung({ ...valid, doc: { ...valid.doc, issue_date } })).toContain(
        "Gültiges Rechnungsdatum fehlt.",
      );
    },
  );

  it("accepts a real leap day", () => {
    expect(
      validateERechnung({ ...valid, doc: { ...valid.doc, issue_date: "2024-02-29" } }),
    ).toEqual([]);
  });

  it("rejects a missing issue date instead of inventing today's date", () => {
    const input = { ...valid, doc: { ...valid.doc, issue_date: null } };
    expect(validateERechnung(input)).toContain("Gültiges Rechnungsdatum fehlt.");
    expect(buildXRechnungXml(input)).not.toContain("<cbc:IssueDate>2026-");
    expect(buildZugferdXml(input)).toContain(
      '<udt:DateTimeString format="102"></udt:DateTimeString>',
    );
  });

  it("rejects a missing seller company name", () => {
    const input = { ...valid, settings: { ...valid.settings, company_name: "" } };
    expect(validateERechnung(input)).toContain(
      "Firmenname des Rechnungsstellers fehlt (Einstellungen).",
    );
  });

  it("accepts valid invoice dates and seller information", () => {
    expect(validateERechnung(valid)).toEqual([]);
    expect(buildXRechnungXml(valid)).toContain("<cbc:IssueDate>2026-10-08</cbc:IssueDate>");
  });
});
