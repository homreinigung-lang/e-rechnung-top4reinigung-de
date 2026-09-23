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

/** Summary for the accountant: review statuses never imply a booking is approved. */
export function summarizeDatevReview(review: DatevReview) {
  const tally = (rows: ReviewRecord[]) => rows.reduce<Record<string, number>>((counts, row) => {
    const status = String(row["preparation_status"] ?? "UNCLASSIFIED");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  return {
    format: "GebCalc DATEV review only; NOT importable EXTF",
    invoices: review.invoices.length,
    expenses: review.expenses.length,
    invoiceStatuses: tally(review.invoices),
    expenseStatuses: tally(review.expenses),
    warnings: [
      "No booking is tax-approved by this report.",
      "Missing dates are shown as review exceptions, not assigned to a period.",
      "DATEV account mapping, debtor/creditor accounts and VAT treatment require accountant approval.",
    ],
  };
}
