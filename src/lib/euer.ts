/**
 * Einnahmenüberschussrechnung (EÜR) nach § 4 Abs. 3 EStG.
 * Betriebseinnahmen (Rechnungen) abzüglich Betriebsausgaben = Gewinn.
 */
import { formatDate, formatMoney } from "@/lib/format";

export type EuerDoc = Record<string, unknown>;
export type EuerExpense = Record<string, unknown>;

export type EuerResult = {
  from: string;
  to: string;
  incomeNet: number;
  incomeVat: number;
  incomeGross: number;
  expenseNet: number;
  expenseVat: number;
  expenseGross: number;
  profit: number;
  incomeCount: number;
  expenseCount: number;
  expensesByCategory: { category: string; net: number; vat: number; gross: number }[];
};

function num(v: unknown) {
  return Number(v ?? 0) || 0;
}

/**
 * Einheitliche Kategorie-Normalisierung – identisch in Dashboard-Charts und EÜR-Tabelle.
 * Leere oder fehlende Kategorien werden immer als „Sonstiges“ geführt.
 */
export function normalizeExpenseCategory(value: unknown): string {
  return String(value ?? "").trim() || "Sonstiges";
}

export type ExpenseCategorySum = { category: string; net: number; vat: number; gross: number };

/** Aggregiert Ausgaben je Kategorie – gemeinsame Basis für EÜR und Dashboard. */
export function aggregateExpensesByCategory(expenses: EuerExpense[]): ExpenseCategorySum[] {
  const map = new Map<string, ExpenseCategorySum>();
  for (const e of expenses) {
    const category = normalizeExpenseCategory(e["category"]);
    const entry = map.get(category) ?? { category, net: 0, vat: 0, gross: 0 };
    entry.net += num(e["net_amount"]);
    entry.vat += num(e["vat_amount"]);
    entry.gross += num(e["gross_amount"]);
    map.set(category, entry);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

/** Entwürfe zählen nicht als Betriebseinnahme; Stornorechnungen mindern den Umsatz. */
export function isEuerIncome(doc: EuerDoc): boolean {
  const status = String(doc["status"] ?? "");
  return doc["type"] === "invoice" && status !== "draft";
}

/** Zeitraum-Filter auf Basis eines ISO-Datums (YYYY-MM-DD), inklusive Grenzen. */
export function inPeriod(dateValue: unknown, from: string, to: string): boolean {
  const d = String(dateValue ?? "").slice(0, 10);
  return d >= from && d <= to;
}

export function computeEuer(
  documents: EuerDoc[],
  expenses: EuerExpense[],
  from: string,
  to: string,
): EuerResult {
  // Defensiv erneut auf den Zeitraum filtern, falls Aufrufer ungefilterte Daten übergeben.
  const income = documents
    .filter(isEuerIncome)
    .filter((d) => inPeriod(d["issue_date"], from, to));
  expenses = expenses.filter((e) => inPeriod(e["expense_date"], from, to));


  const incomeNet = income.reduce((s, d) => s + num(d["net_total"] ?? d["total"]), 0);
  const incomeVat = income.reduce((s, d) => s + num(d["vat_amount"]), 0);
  const incomeGross = income.reduce((s, d) => s + num(d["total"]), 0);

  const expenseNet = expenses.reduce((s, e) => s + num(e["net_amount"]), 0);
  const expenseVat = expenses.reduce((s, e) => s + num(e["vat_amount"]), 0);
  const expenseGross = expenses.reduce((s, e) => s + num(e["gross_amount"]), 0);

  const byCategory = aggregateExpensesByCategory(expenses);

  return {
    from,
    to,
    incomeNet,
    incomeVat,
    incomeGross,
    expenseNet,
    expenseVat,
    expenseGross,
    profit: incomeNet - expenseNet,
    incomeCount: income.length,
    expenseCount: expenses.length,
    expensesByCategory: byCategory,
  };
}

function de(v: number) {
  return v.toFixed(2).replace(".", ",");
}

/** EÜR als CSV (Semikolon, für Excel / Steuerberater). */
export function buildEuerCsv(r: EuerResult): Blob {
  const rows: string[][] = [
    ["Einnahmenüberschussrechnung (§ 4 Abs. 3 EStG)", ""],
    ["Zeitraum", `${formatDate(r.from)} - ${formatDate(r.to)}`],
    ["", ""],
    ["Position", "Betrag in EUR"],
    ["Betriebseinnahmen (netto)", de(r.incomeNet)],
    ["Vereinnahmte Umsatzsteuer", de(r.incomeVat)],
    ["Betriebseinnahmen (brutto)", de(r.incomeGross)],
    ["", ""],
    ["Betriebsausgaben (netto)", de(r.expenseNet)],
    ["Gezahlte Vorsteuer", de(r.expenseVat)],
    ["Betriebsausgaben (brutto)", de(r.expenseGross)],
    ["", ""],
    ["Gewinn / Verlust (netto)", de(r.profit)],
    ["", ""],
    ["Betriebsausgaben je Kategorie", "Netto in EUR"],
    ...r.expensesByCategory.map((c) => [c.category, de(c.net)]),
    ["", ""],
    ["Anzahl Rechnungen", String(r.incomeCount)],
    ["Anzahl Ausgabenbelege", String(r.expenseCount)],
  ];
  const csv = rows
    .map((cols) => cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
}

/** EÜR als PDF-Bericht (A4) für Finanzamt bzw. Steuerberater. */
export async function buildEuerPdf(r: EuerResult, companyName: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 20;

  doc.setFontSize(16);
  doc.text("Einnahmenüberschussrechnung (EÜR)", 15, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`${companyName} · § 4 Abs. 3 EStG`, 15, y);
  y += 5;
  doc.text(`Zeitraum: ${formatDate(r.from)} – ${formatDate(r.to)}`, 15, y);
  y += 10;

  const line = (label: string, value: string, bold = false) => {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, 15, y);
    doc.text(value, 195, y, { align: "right" });
    y += 6;
  };

  doc.setFontSize(11);
  line("Betriebseinnahmen", "", true);
  doc.setFontSize(10);
  line("Umsätze (netto)", formatMoney(r.incomeNet));
  line("Vereinnahmte Umsatzsteuer", formatMoney(r.incomeVat));
  line("Summe brutto", formatMoney(r.incomeGross));
  y += 3;

  doc.setFontSize(11);
  line("Betriebsausgaben", "", true);
  doc.setFontSize(10);
  for (const c of r.expensesByCategory) line(c.category, formatMoney(c.net));
  line("Summe Ausgaben (netto)", formatMoney(r.expenseNet), true);
  line("Gezahlte Vorsteuer", formatMoney(r.expenseVat));
  line("Summe brutto", formatMoney(r.expenseGross));
  y += 3;

  if (y > 265) {
    doc.addPage();
    y = 20;
  }
  doc.line(15, y, 195, y);
  y += 7;
  doc.setFontSize(12);
  line(r.profit >= 0 ? "Gewinn (netto)" : "Verlust (netto)", formatMoney(r.profit), true);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(
    `Belege: ${r.incomeCount} Rechnungen, ${r.expenseCount} Ausgaben · Erstellt am ${new Date().toLocaleString("de-DE-u-ca-gregory-nu-latn")}`,
    15,
    y,
  );

  return doc.output("blob");
}
