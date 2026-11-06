import { describe, expect, it } from "vitest";
import {
  buildXRechnungXml,
  buildZugferdXml,
  validateERechnung,
  isValidLeitwegId,
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

const leitwegId = "04011000-1234512345-06"; // KoSIT example, not a real recipient.

describe("Buyer reference BT-10 and order reference BT-13", () => {
  it.each([buildXRechnungXml, buildZugferdXml])(
    "keeps references distinct in both formats",
    (build) => {
      const xml = build({
        ...valid,
        doc: { ...valid.doc, buyer_reference: leitwegId, order_number: "PO-42" },
      });
      expect(xml).toContain(`BuyerReference>${leitwegId}</`);
      expect(xml).not.toContain("BuyerReference>PO-42</");
      expect(xml).toContain(">PO-42</");
    },
  );

  it("requires an explicit buyer reference for XRechnung, even when an order number exists", () => {
    const input = { ...valid, doc: { ...valid.doc, order_number: "PO-42" } };
    expect(validateERechnung(input, "xrechnung").join()).toContain("Käuferreferenz (BT-10) fehlt");
    expect(buildXRechnungXml(input)).not.toContain("N/A");
  });

  it("omits optional BT-10 for ZUGFeRD instead of inventing a reference", () => {
    expect(validateERechnung(valid, "zugferd")).toEqual([]);
    expect(buildZugferdXml(valid)).not.toContain("BuyerReference");
    expect(buildZugferdXml(valid)).not.toContain("N/A");
  });

  it.each(["xrechnung", "zugferd"] as const)(
    "requires Leitweg-ID when requested for %s",
    (format) => {
      const input = { ...valid, doc: { ...valid.doc, requires_leitweg_id: true } };
      expect(validateERechnung(input, format).join()).toContain(
        "Leitweg-ID des Auftraggebers fehlt",
      );
      expect(
        validateERechnung(
          { ...input, doc: { ...input.doc, buyer_reference: "PO-42" } },
          format,
        ).join(),
      ).toContain("Prüfziffer ungültig");
      expect(
        validateERechnung(
          { ...input, doc: { ...input.doc, buyer_reference: leitwegId } },
          format,
        ).join(),
      ).not.toContain("Leitweg-ID");
    },
  );

  it("escapes customer references in both XML formats", () => {
    const input = {
      ...valid,
      doc: { ...valid.doc, buyer_reference: "TEAM & <A>", order_number: 'PO-"42"' },
    };
    for (const build of [buildXRechnungXml, buildZugferdXml]) {
      expect(build(input)).toContain("TEAM &amp; &lt;A&gt;");
      expect(build(input)).toContain("PO-&quot;42&quot;");
    }
  });
});

describe("Leitweg-ID format and checksum", () => {
  it("accepts the official KoSIT example", () => {
    expect(isValidLeitwegId(leitwegId)).toBe(true);
  });
  it.each([
    "04011000-1234512345-07",
    "04011000 1234512345 06",
    "0204:" + leitwegId,
    "N/A",
    "PO-42",
    "991--12",
    "",
  ])("rejects invalid ID: %s", (id) => {
    expect(isValidLeitwegId(id)).toBe(false);
  });
});
