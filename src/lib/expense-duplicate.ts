export type DuplicateExpenseCandidate = {
  id: string;
  supplier: string;
  expense_date: string;
  document_number: string;
  gross_amount: number | string;
};

export type DuplicateExpenseDraft = {
  supplier: string;
  expense_date: string;
  document_number: string;
  net_amount: string | number;
  vat_amount: string | number;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
}

/**
 * Finds a likely duplicate without blocking legitimate similar expenses.
 * Strong match: same supplier + same document number.
 * Fallback: same supplier + date + exact gross amount when no reliable document number match exists.
 */
export function findDuplicateExpense<T extends DuplicateExpenseCandidate>(
  draft: DuplicateExpenseDraft,
  rows: T[],
): T | null {
  const supplier = normalize(draft.supplier);
  const documentNumber = normalize(draft.document_number);
  const gross = Math.round((Number(draft.net_amount || 0) + Number(draft.vat_amount || 0)) * 100);

  return (
    rows.find((row) => {
      const sameSupplier = supplier !== "" && normalize(row.supplier || "") === supplier;
      const sameDocumentNumber =
        documentNumber !== "" && normalize(row.document_number || "") === documentNumber;

      if (sameSupplier && sameDocumentNumber) return true;

      const rowGross = Math.round(Number(row.gross_amount || 0) * 100);
      return sameSupplier && row.expense_date === draft.expense_date && rowGross === gross;
    }) ?? null
  );
}
