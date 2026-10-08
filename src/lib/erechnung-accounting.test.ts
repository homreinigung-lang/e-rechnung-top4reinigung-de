import { describe, expect, it } from "vitest";
import {
  buildXRechnungXml,
  buildZugferdXml,
  validateERechnung,
  type ERechnungInput,
} from "./erechnung";
const base: ERechnungInput = {
  number: "RE-2026-0001",
  netTotal: 100,
  vatAmount: 19,
  grossTotal: 119,
  vatRate: 19,
  doc: {
    issue_date: "2026-10-08",
    due_date: "2026-10-22",
    customer_company: "Synthetic buyer",
    customer_address_line: "Test 2",
    customer_postal_code: "66111",
    customer_city: "Saarbrücken",
    customer_email: "buyer@example.invalid",
    service_period: "September 2026",
  },
  settings: {
    company_name: "Synthetic seller",
    address_line: "Test 1",
    postal_code: "66111",
    city: "Saarbrücken",
    tax_number: "123/456/78901",
    email: "seller@example.invalid",
    phone: "+4968112345",
  },
  items: [{ position: 1, description: "Cleaning", quantity: 1, unit: "Std", unit_price: 100 }],
};
export const samples = {
  invoice: base,
  discount: {
    ...base,
    doc: { ...base.doc, discount_percent: 10 },
    netTotal: 90,
    vatAmount: 17.1,
    grossTotal: 107.1,
  },
  storno: {
    ...base,
    doc: { ...base.doc, is_storno: true },
    netTotal: -100,
    vatAmount: -19,
    grossTotal: -119,
    items: [{ ...base.items[0]!, unit_price: -100 }],
  },
  rounding: {
    ...base,
    netTotal: 0.06,
    vatAmount: 0.01,
    grossTotal: 0.07,
    items: [1, 2, 3].map((position) => ({
      ...base.items[0]!,
      position,
      quantity: 0.03,
      unit_price: 0.5,
    })),
  },
};
describe("E-Rechnung monetary and syntax regression", () => {
  it("includes both electronic endpoints and rejects missing endpoints before XRechnung export", () => {
    const xml = buildXRechnungXml(base);
    expect(xml).toContain('<cbc:EndpointID schemeID="EM">seller@example.invalid</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="EM">buyer@example.invalid</cbc:EndpointID>');
    expect(validateERechnung(base, "xrechnung")).toEqual([]);
    expect(
      validateERechnung({ ...base, doc: { ...base.doc, customer_email: "" } }, "xrechnung").join(),
    ).toContain("E-Mail-Adresse des Kunden");
  });
  it("keeps undiscounted line sums and declares the header allowance in both syntaxes", () => {
    const ubl = buildXRechnungXml(samples.discount),
      cii = buildZugferdXml(samples.discount);
    expect(ubl).toContain(
      '<cbc:LineExtensionAmount currencyID="EUR">100.00</cbc:LineExtensionAmount>',
    );
    expect(ubl).toContain(
      '<cbc:AllowanceTotalAmount currencyID="EUR">10.00</cbc:AllowanceTotalAmount>',
    );
    expect(ubl).toContain(
      '<cbc:TaxExclusiveAmount currencyID="EUR">90.00</cbc:TaxExclusiveAmount>',
    );
    expect(cii).toContain("<ram:ActualAmount>10.00</ram:ActualAmount>");
    expect(cii).toContain("<ram:LineTotalAmount>100.00</ram:LineTotalAmount>");
    expect(cii).toContain("<ram:TaxBasisTotalAmount>90.00</ram:TaxBasisTotalAmount>");
  });
  it("exports signed internal cancellations as positive credit notes with nonnegative prices", () => {
    const ubl = buildXRechnungXml(samples.storno),
      cii = buildZugferdXml(samples.storno);
    expect(ubl).toContain(
      '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
    );
    expect(ubl).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(ubl).toContain("<cac:CreditNoteLine>");
    expect(ubl).toContain('<cbc:CreditedQuantity unitCode="HUR">1.000</cbc:CreditedQuantity>');
    expect(ubl).toContain('<cbc:PriceAmount currencyID="EUR">100.00</cbc:PriceAmount>');
    expect(cii).toContain("<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>");
    expect(samples.storno.netTotal).toBe(-100);
  });
  it("uses the editor's cent rounding for every line", () => {
    const ubl = buildXRechnungXml(samples.rounding),
      cii = buildZugferdXml(samples.rounding);
    expect(
      ubl.match(/<cbc:LineExtensionAmount currencyID="EUR">0.02<\/cbc:LineExtensionAmount>/g),
    ).toHaveLength(3);
    expect(cii.match(/<ram:LineTotalAmount>0.02<\/ram:LineTotalAmount>/g)).toHaveLength(3);
  });
  it("exports service dates rather than a schema-invalid period description", () => {
    expect(buildXRechnungXml(base)).toContain(
      "<cbc:StartDate>2026-09-01</cbc:StartDate><cbc:EndDate>2026-09-30</cbc:EndDate>",
    );
    expect(buildZugferdXml(base)).toContain(
      '<ram:StartDateTime><udt:DateTimeString format="102">20260901',
    );
    expect(
      buildXRechnungXml({ ...base, doc: { ...base.doc, service_period: "nach Vereinbarung" } }),
    ).toContain("Leistungszeitraum: nach Vereinbarung");
  });
});

it("preserves price precision and uses negative quantity for a negative discount line", () => {
  const precision = {
    ...base,
    items: [{ ...base.items[0]!, unit_price: 1.005 }],
    netTotal: 1.01,
    vatAmount: 0.19,
    grossTotal: 1.2,
  };
  expect(buildXRechnungXml(precision)).toContain(
    '<cbc:PriceAmount currencyID="EUR">1.005</cbc:PriceAmount>',
  );
  const discountLine = {
    ...base,
    items: [
      base.items[0]!,
      { ...base.items[0]!, position: 2, description: "Rabatt", unit_price: -10 },
    ],
    netTotal: 90,
    vatAmount: 17.1,
    grossTotal: 107.1,
  };
  const ubl = buildXRechnungXml(discountLine);
  expect(ubl).toContain('<cbc:InvoicedQuantity unitCode="HUR">-1.000</cbc:InvoicedQuantity>');
  expect(ubl).not.toContain('<cbc:PriceAmount currencyID="EUR">-');
  expect(ubl).not.toContain("<cac:AllowanceCharge>");
});
