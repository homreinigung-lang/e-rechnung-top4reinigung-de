import { describe, expect, it } from "vitest";
import { buildXRechnungXml, buildZugferdXml, type ERechnungInput } from "./erechnung";
import { buildDatevExtf, DATEV_COLUMNS, type DatevOptions } from "./datev-extf";
import { buildInitialDocumentForm } from "./document-initial-form";
import { vatRateForTaxMode, taxNoteForTaxMode, KLEINUNTERNEHMER_NOTE } from "./format";
import { computeDocumentTotals } from "./document-totals";

const input: ERechnungInput = {
  doc: { issue_date: "2026-10-08", customer_company: "Synthetic customer" },
  items: [{ position: 1, description: "Reinigung", quantity: 1, unit: "Std", unit_price: 100 }],
  settings: { company_name: "Synthetic cleaning service" },
  number: "RE-2026-0001",
  netTotal: 100,
  vatAmount: 19,
  grossTotal: 119,
  vatRate: 19,
};

describe("tax mode consistency in document exports", () => {
  it.each([undefined, null, ""])("keeps domestic VAT when the mode is %s", (tax_mode) => {
    const doc = { ...input.doc, tax_mode };
    const x = buildXRechnungXml({ ...input, doc });
    const z = buildZugferdXml({ ...input, doc });
    expect(x).toContain("<cbc:Percent>19.00</cbc:Percent>");
    expect(x).toContain('<cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>');
    expect(z).toContain("<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>");
    expect(z).toContain("<ram:CalculatedAmount>19.00</ram:CalculatedAmount>");
    expect(x).not.toContain("Reverse-Charge");
  });

  it("uses the same domestic default in the editor and XML", () => {
    const form = buildInitialDocumentForm({ doc: input.doc, settings: input.settings });
    expect(form.tax_mode).toBe("domestic");
    const vatRate = vatRateForTaxMode(String(form.tax_mode));
    const totals = computeDocumentTotals(input.items, 0, vatRate);
    expect(totals).toMatchObject({ netTotal: 100, vatAmount: 19, grossTotal: 119 });
    expect(buildXRechnungXml({ ...input, ...totals, vatRate, doc: form })).toContain(
      '<cbc:TaxAmount currencyID="EUR">19.00</cbc:TaxAmount>',
    );
  });

  it.each(["kleinunternehmer", "small_business"])(
    "keeps %s tax-free in both XML formats",
    (tax_mode) => {
      const doc = { ...input.doc, tax_mode };
      const taxFree = { ...input, doc, vatRate: 0, vatAmount: 0, grossTotal: 100 };
      expect(buildXRechnungXml(taxFree)).toContain("<cbc:ID>E</cbc:ID>");
      expect(buildZugferdXml(taxFree)).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
      expect(buildXRechnungXml(taxFree)).toContain("Gemäß § 19 UStG");
      expect(taxNoteForTaxMode(tax_mode)).toBe(KLEINUNTERNEHMER_NOTE);
    },
  );

  it("preserves explicit reverse charge and supplied domestic rates", () => {
    const taxFree = {
      ...input,
      doc: { ...input.doc, tax_mode: "eu_reverse_charge" },
      vatRate: 0,
      vatAmount: 0,
      grossTotal: 100,
    };
    expect(buildXRechnungXml(taxFree)).toContain("<cbc:ID>AE</cbc:ID>");
    expect(buildZugferdXml(taxFree)).toContain("<ram:CategoryCode>AE</ram:CategoryCode>");
    expect(buildXRechnungXml({ ...input, vatRate: 7, vatAmount: 7, grossTotal: 107 })).toContain(
      "<cbc:Percent>7.00</cbc:Percent>",
    );
  });
});

const invoice = {
  issue_date: "2026-10-08",
  number: "RE-2026-0001",
  status: "sent",
  total: 100,
  net_total: 100,
  vat_amount: 0,
  customer_name: "Synthetic customer",
};
const options = (chart: "SKR03" | "SKR04"): DatevOptions => ({
  chart,
  fiscalYear: 2026,
  beraternummer: "12345",
  mandantennummer: "123",
  from: "2026-10-01",
  to: "2026-10-31",
  expenseAccounts: {},
  accounts: [
    {
      chart,
      fiscal_year: 2026,
      account_number: chart === "SKR03" ? "8192" : "4192",
      category: "small_business_revenue",
      account_name: "Kleinunternehmer",
    },
    {
      chart,
      fiscal_year: 2026,
      account_number: chart === "SKR03" ? "8400" : "4400",
      category: "revenue",
      account_name: "Erlöse 19 % USt",
    },
  ],
});
const decode = (bytes: Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
describe.each(["SKR03", "SKR04"] as const)("Kleinunternehmer DATEV %s", (chart) => {
  it.each(["kleinunternehmer", "small_business"])(
    "maps %s invoices and linked reversals to the configured tax-free account",
    (tax_mode) => {
      const doc = { ...invoice, tax_mode };
      const storno = {
        ...doc,
        number: "ST-2026-0001",
        total: -100,
        net_total: -100,
        cancels_document_id: "synthetic-original",
      };
      const lines = decode(buildDatevExtf([doc, storno], [], options(chart)))
        .trim()
        .split("\r\n");
      for (const row of lines.slice(2)) {
        const fields = row.split(";");
        expect(fields[DATEV_COLUMNS.indexOf("Gegenkonto (ohne BU-Schlüssel)")]).toBe(
          chart === "SKR03" ? '"8192"' : '"4192"',
        );
        expect(fields[DATEV_COLUMNS.indexOf("BU-Schlüssel")]).toBe("");
      }
      expect(lines[2]).toContain('"100,00";"S"');
      expect(lines[3]).toContain('"100,00";"H"');
    },
  );

  it.each(["kleinunternehmer", "small_business"])("rejects inconsistent VAT for %s", (tax_mode) => {
    expect(() =>
      buildDatevExtf([{ ...invoice, tax_mode, total: 119, vat_amount: 19 }], [], options(chart)),
    ).toThrow("Kleinunternehmer");
  });

  it("still rejects missing tax-free account mappings and unclassified zero-VAT invoices", () => {
    expect(() =>
      buildDatevExtf([{ ...invoice, tax_mode: "kleinunternehmer" }], [], {
        ...options(chart),
        accounts: [],
      }),
    ).toThrow("small_business_revenue");
    expect(() =>
      buildDatevExtf([{ ...invoice, tax_mode: "domestic" }], [], options(chart)),
    ).toThrow("Steuerfreien Umsatz");
  });
});
