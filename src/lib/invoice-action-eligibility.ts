export type InvoiceAction = "payment" | "reminder";

export type InvoiceActionDocument = {
  type: string;
  status: string;
  is_storno?: boolean | null;
};

/**
 * Server-side eligibility checks: hiding a button in the UI is not sufficient.
 * Drafts must be issued before payment/reminders, and storno/cancelled
 * documents must never be collected or marked paid.
 */
export function assertInvoiceActionAllowed(
  document: InvoiceActionDocument,
  action: InvoiceAction,
): void {
  if (document.type !== "invoice") {
    throw new Error("Diese Aktion ist nur für Rechnungen möglich.");
  }
  if (document.is_storno || document.status === "cancelled") {
    throw new Error("Stornierte Rechnungen können nicht bezahlt oder angemahnt werden.");
  }
  if (document.status === "draft") {
    throw new Error("Entwürfe müssen zuerst ausgestellt werden.");
  }
  if (document.status === "paid") {
    throw new Error(
      action === "payment"
        ? "Diese Rechnung ist bereits bezahlt."
        : "Für bezahlte Rechnungen ist keine Mahnung möglich.",
    );
  }
}

/** Reverting payment must not revive cancelled invoices or modify other documents. */
export function assertInvoicePaymentReversible(document: InvoiceActionDocument): void {
  if (document.type !== "invoice" || document.is_storno || document.status !== "paid") {
    throw new Error("Nur bezahlte, nicht stornierte Rechnungen können wieder geöffnet werden.");
  }
}
