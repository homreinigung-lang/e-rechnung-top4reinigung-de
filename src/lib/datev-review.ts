/**
 * DATEV preparation review: deliberately NOT an importable DATEV EXTF booking batch.
 * Includes excluded/review-required transactions so no tax case silently disappears.
 */
export type ReviewRecord = Record<string, unknown>;
export type DatevReview = {
  settings: ReviewRecord | null;
  invoices: ReviewRecord[];
  expenses: ReviewRecord[];
};

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // Prevent spreadsheet formula injection in accountant-facing exports.
  const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function buildDatevReviewCsv(review: DatevReview): string {
  const headers = [
    "Typ", "Status", "Datum", "Belegnummer", "Beleg-ID",
    "Geschäftspartner", "Netto", "USt", "Brutto", "Vorgeschlagenes Konto",
    "Beleg vorhanden", "SKR", "Wirtschaftsjahr",
  ];
  const invoiceRows = review.invoices.map((r) => [
    r["preparation_status"] === "NOT_INVOICE" ? "Kein Rechnungsbeleg" : "Rechnung",
    r["preparation_status"], r["issue_date"], r["number"], r["document_id"],
    r["customer_number"], r["net_total"], r["vat_amount"], r["total"],
    r["proposed_revenue_account"], "", r["chart"], r["fiscal_year"],
  ]);
  const expenseRows = review.expenses.map((r) => [
    "Ausgabe", r["preparation_status"], r["expense_date"], r["document_number"], r["expense_id"],
    r["supplier"], r["net_amount"], r["vat_amount"], r["gross_amount"],
    r["proposed_expense_account"], r["has_receipt"], r["chart"], r["fiscal_year"],
  ]);
  const lines = [headers, ...invoiceRows, ...expenseRows];
  return "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
