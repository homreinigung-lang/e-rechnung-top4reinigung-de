import { describe, expect, it } from "vitest";
import { buildInitialDocumentForm } from "./document-initial-form";
import { computeDocumentTotals } from "./document-totals";
import { taxNoteForTaxMode, vatRateForTaxMode } from "./format";
import { buildDatevExtf, DATEV_COLUMNS, type DatevOptions } from "./datev-extf";
import { buildXRechnungXml, buildZugferdXml, validateERechnung } from "./erechnung";
import { taxModeLabel } from "./tax-mode";

const items = [
  { position: 1, description: "Gebäudereinigung", quantity: 4, unit: "Std", unit_price: 250 },
];
const modes = ["domestic", "domestic_reverse_charge", "eu_reverse_charge", "kleinunternehmer"];

describe("tax mode round trip and exports", () => {
  it.each([
    ["domestic", "19% Inland"],
    [null, "19% Inland"],
    ["domestic_reverse_charge", "§ 13b Inland Gebäudereinigung"],
    ["eu_reverse_charge", "Reverse-Charge EU"],
    ["kleinunternehmer", "Kleinunternehmer § 19 UStG"],
    ["small_business", "Kleinunternehmer § 19 UStG"],
  ])("labels %s consistently for GoBD and accountant exports", (mode, label) => {
    expect(taxModeLabel(mode)).toBe(label);
  });
  it.each(modes)("preserves %s on reopening, including discounts", (mode) => {
    const form = buildInitialDocumentForm({ doc: { tax_mode: mode }, settings: {} });
    expect(form["tax_mode"]).toBe(mode);
    const rate = vatRateForTaxMode(String(form["tax_mode"]));
    const totals = computeDocumentTotals(items, 10, rate);
    expect(totals).toMatchObject({
      netTotal: 900,
      vatAmount: mode === "domestic" ? 171 : 0,
      grossTotal: mode === "domestic" ? 1071 : 900,
    });
    const input = {
      doc: {
        ...form,
        issue_date: "2026-10-29",
        customer_company: "Synthetic customer",
        customer_address_line: "Testweg 2",
        customer_postal_code: "66111",
        customer_city: "Saarbrücken",
        customer_vat_id: "DE123456789",
        customer_email: "buyer@example.invalid",
      },
      settings: {
        company_name: "Synthetic cleaner",
        address_line: "Testweg 1",
        postal_code: "66111",
        city: "Saarbrücken",
        vat_id: "DE987654321",
        email: "seller@example.invalid",
        phone: "+496810000",
        owner_name: "Synthetic Owner",
      },
      items,
      number: "RE-2026-TEST",
      vatRate: rate,
      ...totals,
    };
    expect(validateERechnung(input, "xrechnung")).toEqual([]);
    const category = mode === "domestic" ? "S" : mode === "kleinunternehmer" ? "E" : "AE";
    expect(buildXRechnungXml(input)).toContain(`<cbc:ID>${category}</cbc:ID>`);
    expect(buildZugferdXml(input)).toContain(`<ram:CategoryCode>${category}</ram:CategoryCode>`);
    expect(buildXRechnungXml(input)).toContain(
      `<cbc:PayableAmount currencyID="EUR">${totals.grossTotal.toFixed(2)}</cbc:PayableAmount>`,
    );
    if (mode === "domestic_reverse_charge") {
      expect(taxNoteForTaxMode(mode)).toContain("§ 13b Abs. 2 Nr. 8 UStG");
      expect(taxNoteForTaxMode(mode)).not.toContain("Art. 196");
    }
  });

  it.each(["SKR03", "SKR04"] as const)(
    "keeps domestic and EU reverse-charge accounts separate in %s, including storno",
    (chart) => {
      const domestic = chart === "SKR03" ? "8337" : "4337";
      const eu = chart === "SKR03" ? "8336" : "4336";
      const opts: DatevOptions = {
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
            account_number: domestic,
            account_name: "Inland §13b",
            category: "revenue_reverse_charge",
          },
          {
            chart,
            fiscal_year: 2026,
            account_number: eu,
            account_name: "EU RC",
            category: "revenue_eu_reverse_charge",
          },
        ],
      };
      for (const tax_mode of ["domestic_reverse_charge", "eu_reverse_charge"]) {
        const doc = {
          issue_date: "2026-10-29",
          number: "RE-TEST",
          status: "sent",
          tax_mode,
          net_total: 1000,
          vat_amount: 0,
          total: 1000,
        };
        const reversal = {
          ...doc,
          number: "ST-TEST",
          net_total: -1000,
          total: -1000,
          cancels_document_id: "synthetic-original",
        };
        const rows = new TextDecoder("windows-1252")
          .decode(buildDatevExtf([doc, reversal], [], opts))
          .trim()
          .split("\r\n")
          .slice(2)
          .map((row) => row.split(";"));
        for (const row of rows) {
          expect(row[DATEV_COLUMNS.indexOf("Gegenkonto (ohne BU-Schlüssel)")]).toBe(
            `"${tax_mode === "domestic_reverse_charge" ? domestic : eu}"`,
          );
          expect(row[DATEV_COLUMNS.indexOf("BU-Schlüssel")]).toBe("");
        }
        expect(rows[0]?.[1]).toBe('"S"');
        expect(rows[1]?.[1]).toBe('"H"');
        expect(() => buildDatevExtf([{ ...doc, vat_amount: 190, total: 1190 }], [], opts)).toThrow(
          "Reverse-Charge",
        );
        expect(() => buildDatevExtf([doc], [], { ...opts, accounts: [] })).toThrow();
      }
    },
  );
});
