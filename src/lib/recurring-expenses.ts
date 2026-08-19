import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/format";
import { addMonths } from "@/lib/recurring";

export type RecurringExpense = {
  id: string;
  title: string;
  supplier: string;
  category: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  notes: string;
  interval_months: number;
  next_run: string;
  active: boolean;
  last_run_at: string | null;
};

export function isExpenseDue(nextRun: string): boolean {
  return nextRun <= today();
}

/** Erzeugt aus einer wiederkehrenden Ausgabe einen Eintrag in der Ausgabenliste. */
export async function runRecurringExpense(id: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Nicht angemeldet");

  const { data: rec, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;

  const expenseDate = isExpenseDue(rec.next_run) ? rec.next_run : today();
  const net = Number(rec.net_amount) || 0;
  const vat = Number(rec.vat_amount) || 0;

  const { error: insertError } = await supabase.from("expenses").insert({
    user_id: userId,
    supplier: rec.supplier || rec.title,
    expense_date: expenseDate,
    category: rec.category || "Sonstiges",
    document_number: "",
    net_amount: net,
    vat_amount: vat,
    gross_amount: net + vat,
    notes: [rec.title, rec.notes].filter(Boolean).join(" · "),
    receipt_url: "",
  });
  if (insertError) throw insertError;

  await supabase
    .from("recurring_expenses")
    .update({
      next_run: addMonths(expenseDate, Number(rec.interval_months) || 1),
      last_run_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
}

/** Führt alle fälligen, aktiven Serien aus. Gibt die Anzahl erzeugter Ausgaben zurück. */
export async function runDueRecurringExpenses(): Promise<number> {
  const { data, error } = await supabase
    .from("recurring_expenses")
    .select("id, next_run, active")
    .eq("active", true)
    .lte("next_run", today());
  if (error) throw error;
  let count = 0;
  for (const row of data ?? []) {
    await runRecurringExpense(row.id);
    count += 1;
  }
  return count;
}
