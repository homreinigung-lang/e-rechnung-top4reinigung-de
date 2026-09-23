import { describe, expect, it } from "vitest";
import { buildDatevExtf, DATEV_COLUMNS, type DatevOptions } from "./datev-extf";

const accounts: DatevOptions["accounts"] = [
  { chart:"SKR03", fiscal_year:2026,account_number:"8400",account_name:"Erlöse 19 % USt",category:"revenue" },
  { chart:"SKR03", fiscal_year:2026,account_number:"8336",account_name:"EU Reverse-Charge",category:"revenue_eu_reverse_charge" },
  { chart:"SKR03", fiscal_year:2026,account_number:"4900",account_name:"Sonstige Aufwendungen",category:"expense" },
  { chart:"SKR04", fiscal_year:2026,account_number:"4400",account_name:"Erlöse 19 % USt",category:"revenue" },
  { chart:"SKR04", fiscal_year:2026,account_number:"4336",account_name:"EU Reverse-Charge",category:"revenue_eu_reverse_charge" },
  { chart:"SKR04", fiscal_year:2026,account_number:"6300",account_name:"Sonstige Aufwendungen",category:"expense" },
];
const options = (chart: "SKR03"|"SKR04"):DatevOptions => ({
  chart,fiscalYear:2026,beraternummer:"12345",mandantennummer:"123",
  expenseAccounts:{Reinigungsmittel:chart==="SKR03"?"4900":"6300"},
  from:"2026-09-01",to:"2026-09-30",accounts
});
const decode = (bytes:Uint8Array) => new TextDecoder("windows-1252").decode(bytes);
const invoice = { issue_date:"2026-09-15",number:"RE-1",total:119,net_total:100,vat_amount:19,tax_mode:"domestic",customer_name:"Kunde" };
const expense = { expense_date:"2026-09-16",document_number:"A-1",supplier:"Firma",gross_amount:119,net_amount:100,vat_amount:19,category:"Reinigungsmittel" };

describe("DATEV EXTF",()=>{
  it.each(["SKR03","SKR04"] as const)("exports %s with proper header, columns and account mapping",chart=>{
    const text=decode(buildDatevExtf([invoice],[expense],options(chart),new Date(2026,8,23,12)));
    const lines=text.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]!.split(";")).toHaveLength(31);
    expect(lines[0]).toContain('"EXTF";700;21;"Buchungsstapel";13');
    expect(lines[1]!.split(";")).toHaveLength(125);
    expect(lines[1]).toBe(DATEV_COLUMNS.join(";"));
    expect(lines[2]!.split(";")).toHaveLength(125);
    expect(lines[3]!.split(";")).toHaveLength(125);
    expect(lines[2]).toContain(chart==="SKR03"?"8400":"4400");
    expect(lines[3]).toContain(chart==="SKR03"?"4900":"6300");
    expect(lines[3]).toContain('"9"');
  });
  it("maps EU services without treating them as domestic reverse charge",()=>{
    const text=decode(buildDatevExtf([{...invoice,total:100,net_total:100,vat_amount:0,tax_mode:"eu_reverse_charge"}],[],options("SKR03")));
    expect(text).toContain('"8336"');
  });
  it("blocks missing mapping and ambiguous tax instead of exporting a wrong account",()=>{
    expect(()=>buildDatevExtf([], [expense], {...options("SKR03"),expenseAccounts:{}})).toThrow("Kontenzuordnung");
    expect(()=>buildDatevExtf([{...invoice,vat_amount:12}],[],options("SKR03"))).toThrow();
  });
  it("does not add Excel-only summaries or UTF-8 BOM",()=>{
    const bytes=buildDatevExtf([invoice],[],options("SKR03"));
    expect(Array.from(bytes.slice(0,3))).not.toEqual([239,187,191]);
    expect(decode(bytes)).not.toContain("Zusammenfassung");
  });
});
