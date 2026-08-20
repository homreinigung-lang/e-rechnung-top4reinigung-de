import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/gobd";
import { addDays, today } from "@/lib/format";
import { reserveDocumentNumber } from "@/lib/doc-number";

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Nicht angemeldet");
  return uid;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function isDue(nextRun: string): boolean {
  return nextRun <= today();
}

/** Erzeugt aus einer wiederkehrenden Vorlage eine neue Rechnung (Entwurf). */
export async function runRecurring(recurringId: string): Promise<string> {
  const userId = await currentUserId();

  const { data: rec, error } = await supabase
    .from("recurring_invoices")
    .select("*")
    .eq("id", recurringId)
    .single();
  if (error) throw error;
  if (!rec.template_document_id) throw new Error("Bitte zuerst eine Vorlage-Rechnung auswählen.");

  const { data: src, error: srcError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", rec.template_document_id)
    .single();
  if (srcError) throw srcError;

  const { data: items } = await supabase
    .from("document_items")
    .select("*")
    .eq("document_id", rec.template_document_id)
    .order("position");

  const { data: settings } = await supabase
    .from("company_settings")
    .select("payment_terms_days")
    .maybeSingle();
  const number = await reserveDocumentNumber("invoice");

  const issue = today();
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    sent_at: _s,
    locked_at: _l,
    archived_at: _a,
    pdf_path: _p,
    pdf_sha256: _h,
    is_storno: _st,
    cancels_document_id: _cd,
    cancelled_by_document_id: _cb,
    converted_document_id: _cv,
    reminder_level: _rl,
    last_reminder_at: _lr,
    retention_until: _ru,
    deleted_at: _dl,
    ...rest
  } = src as unknown as Record<string, unknown>;

  const { data: created, error: insertError } = await supabase
    .from("documents")
    .insert({
      ...rest,
      user_id: userId,
      type: "invoice",
      number,
      status: "draft",
      issue_date: issue,
      due_date: addDays(issue, Number(settings?.payment_terms_days ?? 14)),
    } as never)
    .select("id")
    .single();
  if (insertError) throw insertError;

  if (items && items.length > 0) {
    await supabase.from("document_items").insert(
      items.map((i, index) => ({
        document_id: created.id,
        user_id: userId,
        position: index + 1,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
      })),
    );
  }

  const base = isDue(rec.next_run) ? rec.next_run : issue;
  await supabase
    .from("recurring_invoices")
    .update({ next_run: addMonths(base, Number(rec.interval_months) || 1) } as never)
    .eq("id", recurringId);

  await logAudit(
    "recurring_created",
    { id: created.id as string, number },
    {
      recurring: rec.title,
      interval_months: rec.interval_months,
    },
  );

  return created.id as string;
}
