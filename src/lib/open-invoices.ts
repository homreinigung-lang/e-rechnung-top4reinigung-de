/** Amount, count and list must describe the same issued, unpaid invoices. */
export function summarizeOpenInvoices<
  T extends { status: string; total: number | string | null; is_storno?: boolean | null },
>(invoices: T[]) {
  const items = invoices.filter(
    (invoice) =>
      !invoice.is_storno && !["paid", "draft", "cancelled"].includes(invoice.status),
  );
  return { items, total: items.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0) };
}
