/** DATEV EXTF v13 Buchungsstapel. Source headings retain DATEV's 125-field order. */
export const DATEV_COLUMNS = [
  "Umsatz (ohne Soll/Haben-Kz)",
  "Soll/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basisumsatz",
  "WKZ Basisumsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
  "Postensperre",
  "Diverse Adressnummer",
  "Geschäftspartnerbank",
  "Sachverhalt",
  "Zinssperre",
  "Beleglink",
  "Beleginfo – Art 1",
  "Beleginfo – Inhalt 1",
  "Beleginfo – Art 2",
  "Beleginfo – Inhalt 2",
  "Beleginfo – Art 3",
  "Beleginfo – Inhalt 3",
  "Beleginfo – Art 4",
  "Beleginfo – Inhalt 4",
  "Beleginfo – Art 5",
  "Beleginfo – Inhalt 5",
  "Beleginfo – Art 6",
  "Beleginfo – Inhalt 6",
  "Beleginfo – Art 7",
  "Beleginfo – Inhalt 7",
  "Beleginfo – Art 8",
  "Beleginfo – Inhalt 8",
  "KOST1 – Kostenstelle",
  "KOST2 – Kostenstelle",
  "Kost Menge",
  "EU-Land u. USt-IdNr.",
  "EU-Steuersatz",
  "Abw. Versteuerungsart",
  "Sachverhalt L+L",
  "Funktionsergänzung L+L",
  "BU 49 Hauptfunktionstyp",
  "BU 49 Hauptfunktionsnummer",
  "BU 49 Funktionsergänzung",
  "Zusatzinformation – Art 1",
  "Zusatzinformation – Inhalt 1",
  "Zusatzinformation – Art 2",
  "Zusatzinformation – Inhalt 2",
  "Zusatzinformation – Art 3",
  "Zusatzinformation – Inhalt 3",
  "Zusatzinformation – Art 4",
  "Zusatzinformation – Inhalt 4",
  "Zusatzinformation – Art 5",
  "Zusatzinformation – Inhalt 5",
  "Zusatzinformation – Art 6",
  "Zusatzinformation – Inhalt 6",
  "Zusatzinformation – Art 7",
  "Zusatzinformation – Inhalt 7",
  "Zusatzinformation – Art 8",
  "Zusatzinformation – Inhalt 8",
  "Zusatzinformation – Art 9",
  "Zusatzinformation – Inhalt 9",
  "Zusatzinformation – Art 10",
  "Zusatzinformation – Inhalt 10",
  "Zusatzinformation – Art 11",
  "Zusatzinformation – Inhalt 11",
  "Zusatzinformation – Art 12",
  "Zusatzinformation – Inhalt 12",
  "Zusatzinformation – Art 13",
  "Zusatzinformation – Inhalt 13",
  "Zusatzinformation – Art 14",
  "Zusatzinformation – Inhalt 14",
  "Zusatzinformation – Art 15",
  "Zusatzinformation – Inhalt 15",
  "Zusatzinformation – Art 16",
  "Zusatzinformation – Inhalt 16",
  "Zusatzinformation – Art 17",
  "Zusatzinformation – Inhalt 17",
  "Zusatzinformation – Art 18",
  "Zusatzinformation – Inhalt 18",
  "Zusatzinformation – Art 19",
  "Zusatzinformation – Inhalt 19",
  "Zusatzinformation – Art 20",
  "Zusatzinformation – Inhalt 20",
  "Stück",
  "Gewicht",
  "Zahlweise",
  "Forderungsart",
  "Veranlagungsjahr",
  "Zugeordnete Fälligkeit",
  "Skontotyp",
  "Auftragsnummer",
  "Buchungstyp",
  "USt-Schlüssel (Anzahlungen)",
  "EU-Mitgliedstaat (Anzahlungen)",
  "Sachverhalt L+L (Anzahlungen)",
  "EU-Steuersatz (Anzahlungen)",
  "Erlöskonto (Anzahlungen)",
  "Herkunft-Kz",
  "Leerfeld",
  "KOST-Datum",
  "SEPA-Mandatsreferenz",
  "Skontosperre",
  "Gesellschaftername",
  "Beteiligtennummer",
  "Identifikationsnummer",
  "Zeichnernummer",
  "Postensperre bis",
  "Bezeichnung",
  "Kennzeichen",
  "Festschreibung",
  "Leistungsdatum",
  "Datum Zuord.",
  "Fälligkeit",
  "Generalumkehr",
  "Steuersatz",
  "Land",
  "Abrechnungsreferent",
  "BVV-Position",
  "EU-Mitgliedstaat u. UStID (Ursprung)",
  "EU-Steuersatz (Ursprung)",
  "Abw. Skontokonto"
] as const;
export type DatevChart = "SKR03" | "SKR04";
export type DatevAccount = { chart: string; fiscal_year: number; account_number: string; category: string; account_name: string };
export type DatevDocument = { issue_date: string; number: string; total: number | string; net_total?: number | string | null; vat_amount?: number | string | null; tax_mode?: string | null; customer_company?: string | null; customer_name?: string | null; status?: string | null; cancels_document_id?: string | null };
export type DatevExpense = { expense_date: string; document_number?: string | null; supplier?: string | null; gross_amount: number | string; category?: string | null; net_amount?: number | string | null; vat_amount?: number | string | null };
export type DatevOptions = { chart: DatevChart; fiscalYear: number; beraternummer: string; mandantennummer: string; expenseAccounts: Record<string,string>; from: string; to: string; accounts: DatevAccount[] };

const quote = (text: unknown) => '"' + String(text ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ") + '"';
const fmt = (amount: number) => amount.toFixed(2).replace(".", ",");
const cents = (v: unknown) => Math.round((Number(v ?? 0) + Number.EPSILON) * 100);
const ymd = (v: string) => v.replace(/-/g, "");
function dateOf(v: string, from: string, to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < from || v > to) throw new Error("DATEV: Belegdatum außerhalb des Buchungszeitraums.");
  return v.slice(8, 10) + v.slice(5, 7);
}
function matchAccount(accounts: DatevAccount[], category: string, opts: DatevOptions, rate?: number): string {
  const candidates = accounts.filter(a => a.chart === opts.chart && a.fiscal_year === opts.fiscalYear && a.category === category);
  const found = rate === undefined ? candidates[0] : candidates.find(a => a.account_name.includes(rate + " %"));
  if (!found) throw new Error("DATEV: Fehlendes " + category + "-Konto für " + opts.chart + " (" + (rate ?? "") + ").");
  return found.account_number;
}
function taxRate(net: number, vat: number): 0 | 7 | 19 {
  if (!vat) return 0;
  if (net <= 0) throw new Error("DATEV: Umsatzsteuer ohne Nettobetrag.");
  if (Math.abs(vat - Math.round(net * 0.07)) <= 1) return 7;
  if (Math.abs(vat - Math.round(net * 0.19)) <= 1) return 19;
  throw new Error("DATEV: Steuersatz nicht eindeutig; Buchung vor Export prüfen.");
}
const pad = (obj: Record<string, string>) => DATEV_COLUMNS.map(k => obj[k] === undefined ? "" : quote(obj[k])).join(";");
/** CP1252 is needed for DATEV classic EXTF; reject unrepresentable symbols instead of corrupting fields. */
export function cp1252(text: string): Uint8Array {
  const special: Record<number,number> = {8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
  return Uint8Array.from(Array.from(text).map(char => {
    const point = char.codePointAt(0)!;
    if (point === 9 || point === 10 || point === 13 || (point >= 32 && point <= 126) || (point >= 160 && point <= 255)) return point;
    if (special[point] !== undefined) return special[point];
    throw new Error("DATEV: Nicht darstellbares Zeichen in Buchungsdaten: " + char);
  }));
}
export function buildDatevExtf(documents: DatevDocument[], expenses: DatevExpense[], opts: DatevOptions, now = new Date()): Uint8Array {
  if (!["SKR03","SKR04"].includes(opts.chart) || !/^\d{1,7}$/.test(opts.beraternummer) || !/^\d{1,5}$/.test(opts.mandantennummer)) throw new Error("DATEV: Berater- und Mandantennummer eintragen.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to) || opts.from > opts.to || opts.from.slice(0,4) !== String(opts.fiscalYear) || opts.to.slice(0,4) !== String(opts.fiscalYear)) throw new Error("DATEV: Buchungszeitraum muss innerhalb eines Wirtschaftsjahrs liegen.");

  const yearStart = String(opts.fiscalYear) + "0101";
  const stamp = [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0"),String(now.getHours()).padStart(2,"0"),String(now.getMinutes()).padStart(2,"0"),String(now.getSeconds()).padStart(2,"0"),String(now.getMilliseconds()).padStart(3,"0")].join("");
  const header = ["EXTF","700","21","Buchungsstapel","13",stamp,"","RE","Hom Reinigung","",""+Number(opts.beraternummer),""+Number(opts.mandantennummer),yearStart,"4",ymd(opts.from),ymd(opts.to),"Buchungen","","1","0","0","EUR","","","","",opts.chart==="SKR03"?"3":"4","","","",""];
  if (header.length!==31 || DATEV_COLUMNS.length!==125) throw new Error("DATEV: Fehlerhafter EXTF-Aufbau.");
  const meta = header.map((v,i)=> [0,3,7,8,9,16].includes(i)?quote(v):v).join(";");
  const lines = [meta,DATEV_COLUMNS.join(";")];
  for (const doc of documents) {
    if (doc.status && !["sent", "paid", "cancelled"].includes(doc.status)) throw new Error("DATEV: Nur endgültige Rechnungen exportieren: " + doc.number);
    const signedGross = cents(doc.total), signedVat = cents(doc.vat_amount);
    const signedNet = doc.net_total == null ? signedGross-signedVat : cents(doc.net_total);
    const reversal = signedGross < 0;
    if (reversal && !doc.cancels_document_id) throw new Error("DATEV: Negativer Betrag ohne zugehörigen Stornobeleg: " + doc.number);
    if (signedGross===0 || Math.abs(signedNet+signedVat-signedGross)>1 || (reversal && (signedNet>0 || signedVat>0))) throw new Error("DATEV: Rechnungsbeträge prüfen: " + doc.number);
    const gross = Math.abs(signedGross), vat = Math.abs(signedVat), net = Math.abs(signedNet);
    const reverse = doc.tax_mode === "reverse_charge" || doc.tax_mode === "eu_reverse_charge";
    const rate=reverse?0:taxRate(net,vat);
    if (reverse && vat!==0) throw new Error("DATEV: Reverse-Charge-Rechnung mit Umsatzsteuer: " + doc.number);
    if (!reverse && rate === 0 && doc.tax_mode !== "small_business") throw new Error("DATEV: Steuerfreien Umsatz bitte steuerlich zuordnen: " + doc.number);
    const revenue = doc.tax_mode === "eu_reverse_charge" ? matchAccount(opts.accounts,"revenue_eu_reverse_charge",opts) : reverse?matchAccount(opts.accounts,"revenue_reverse_charge",opts):rate===0?matchAccount(opts.accounts,"small_business_revenue",opts):matchAccount(opts.accounts,"revenue",opts,rate);
    lines.push(pad({"Umsatz (ohne Soll/Haben-Kz)":fmt(gross/100),"Soll/Haben-Kennzeichen":reversal?"H":"S","WKZ Umsatz":"EUR","Konto":"10000","Gegenkonto (ohne BU-Schlüssel)":revenue,"Belegdatum":dateOf(doc.issue_date,opts.from,opts.to),"Belegfeld 1":doc.number.slice(0,36),"Buchungstext":String(doc.customer_company||doc.customer_name||"Rechnung").slice(0,60)}));
  }
  for (const expense of expenses) {
    const gross=cents(expense.gross_amount),vat=cents(expense.vat_amount);
    const net=expense.net_amount==null?gross-vat:cents(expense.net_amount);
    if(gross<=0 || Math.abs(net+vat-gross)>1) throw new Error("DATEV: Ausgabenbeträge prüfen: " + (expense.document_number||expense.supplier));
    const rate=taxRate(net,vat);
    const expenseAccount = opts.expenseAccounts[String(expense.category ?? "")];
    if (!expenseAccount || !opts.accounts.some(a=>a.chart===opts.chart && a.fiscal_year===opts.fiscalYear && a.account_number===expenseAccount && a.category==="expense")) throw new Error("DATEV: Kontenzuordnung fehlt für " + (expense.category || "Ausgabe") + ".");
    lines.push(pad({"Umsatz (ohne Soll/Haben-Kz)":fmt(gross/100),"Soll/Haben-Kennzeichen":"S","WKZ Umsatz":"EUR","Konto":expenseAccount,"Gegenkonto (ohne BU-Schlüssel)":"70000","BU-Schlüssel":rate===19?"9":rate===7?"8":"","Belegdatum":dateOf(expense.expense_date,opts.from,opts.to),"Belegfeld 1":String(expense.document_number||"").slice(0,36),"Buchungstext":String(expense.supplier||"Ausgabe").slice(0,60)}));
  }
  if (lines.length===2) throw new Error("DATEV: Keine Buchungen im ausgewählten Zeitraum.");
  return cp1252(lines.join("\r\n")+"\r\n");
}
