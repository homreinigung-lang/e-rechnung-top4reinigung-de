import { z } from "zod";

const receiptResult = z
  .object({
    supplier: z.string(),
    document_number: z.string(),
    expense_date: z.string(),
    net_amount: z.number().finite().nonnegative(),
    vat_amount: z.number().finite().nonnegative(),
    gross_amount: z.number().finite().positive(),
    category: z.string(),
    notes: z.string(),
  })
  .refine((r) => Math.abs(r.net_amount + r.vat_amount - r.gross_amount) <= 0.02);

/** Validate and format before scheduling a React state update. */
export function receiptFormValues(value: unknown) {
  const result = receiptResult.safeParse(value);
  if (!result.success) {
    throw new Error(
      "Die Belegdaten konnten nicht übernommen werden. Der Anhang bleibt erhalten. Bitte erneut auslesen oder die Beträge manuell ergänzen.",
    );
  }
  return {
    ...result.data,
    net_amount: result.data.net_amount.toFixed(2),
    vat_amount: result.data.vat_amount.toFixed(2),
  };
}
