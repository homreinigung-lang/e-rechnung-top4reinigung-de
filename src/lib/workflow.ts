import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/gobd";
import { addDays, nextNumber, today } from "@/lib/format";

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Nicht angemeldet");
  return uid;
}

/** Restlaufzeit bis zur Fälligkeit bzw. Überfälligkeit in Tagen. */
export function dueInfo(
  dueDate?: string | null,
  status?: string | null,
): { label: string; overdue: boolean } | null {
  if (!dueDate || status === "paid" || status === "cancelled" || status === "draft") return null;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return { label: `Überfällig seit ${Math.abs(days)} Tagen`, overdue: true };
  if (days === 0) return { label: "Heute fällig", overdue: true };
  return { label: `Fällig in ${days} Tagen`, overdue: false };
}

export const MAHN_STUFE: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
  4: "Letzte Mahnung",
};

export function mahnLabel(level: number): string {
  return MAHN_STUFE[level] ?? `${level}. Mahnung`;
}

export type ReminderKind = "erinnerung" | "mahnung";

/** Prüft, ob die Zahlungsfrist (Zahlungsziel) vollständig abgelaufen ist. */
export function mahnungAllowed(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() > due.getTime();
}

/** Zahlungserinnerung oder Mahnung erfassen (GoBD-konform protokolliert). */
export async function sendReminder(id: string, kind: ReminderKind): Promise<number> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number, status, reminder_level, due_date")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (doc.status === "paid" || doc.status === "cancelled") {
    throw new Error("Für bezahlte oder stornierte Rechnungen ist keine Mahnung möglich.");
  }
  if (kind === "mahnung" && !mahnungAllowed(doc.due_date)) {
    throw new Error(
      "Eine Mahnung ist erst zulässig, wenn die Zahlungsfrist (14 Tage) vollständig abgelaufen ist. Bitte zunächst eine Zahlungserinnerung senden.",
    );
  }
  const current = Number(doc.reminder_level ?? 0);
  const level = kind === "erinnerung" ? Math.max(1, current) : Math.max(2, current + 1);
  const { error: updateError } = await supabase
    .from("documents")
    .update({ reminder_level: level, last_reminder_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (updateError) throw updateError;
  await logAudit(
    kind === "erinnerung" ? "zahlungserinnerung" : "mahnung",
    { id, number: doc.number },
    {
      level,
      stufe: mahnLabel(level),
    },
  );
  return level;
}

/** @deprecated – nutze sendReminder(id, "mahnung"). */
export async function sendMahnung(id: string): Promise<number> {
  return sendReminder(id, "mahnung");
}

/**
 * Rechnung als bezahlt markieren: Status wechselt automatisch auf "Bezahlt"
 * und das Zahlungsdatum wird gespeichert. Damit verschwindet der Beleg
 * sofort aus den offenen Posten.
 */
export async function markInvoicePaid(id: string, paidDate?: string): Promise<string> {
  const paid = paidDate && paidDate.length === 10 ? paidDate : today();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number, status, type")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (doc.type !== "invoice") throw new Error("Nur Rechnungen können als bezahlt markiert werden.");
  if (doc.status === "cancelled")
    throw new Error("Stornierte Rechnungen können nicht bezahlt werden.");

  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "paid", paid_at: paid } as never)
    .eq("id", id);
  if (updateError) throw updateError;

  await logAudit("payment_received", { id, number: doc.number }, { paid_at: paid });
  return paid;
}

/** Zahlungsmarkierung zurücknehmen (Beleg gilt wieder als offen). */
export async function unmarkInvoicePaid(id: string): Promise<void> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "sent", paid_at: null } as never)
    .eq("id", id);
  if (updateError) throw updateError;
  await logAudit("payment_reverted", { id, number: doc.number }, {});
}

/** Angebot annehmen oder ablehnen. */
export async function setQuoteDecision(id: string, decision: "accepted" | "declined") {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: decision } as never)
    .eq("id", id);
  if (updateError) throw updateError;
  await logAudit(decision === "accepted" ? "quote_accepted" : "quote_declined", doc, {});
}

/** Angebot mit Begründung ablehnen (Grund wird in den Anmerkungen archiviert). */
export async function declineQuote(id: string, reason: string): Promise<void> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number, notes")
    .eq("id", id)
    .single();
  if (error) throw error;
  const trimmed = reason.trim();
  const note = trimmed
    ? `${doc.notes ? `${doc.notes}\n\n` : ""}Ablehnungsgrund (${formatToday()}): ${trimmed}`
    : doc.notes;
  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "declined", notes: note } as never)
    .eq("id", id);
  if (updateError) throw updateError;
  await logAudit("quote_declined", { id, number: doc.number }, { reason: trimmed });
}

/** Auftrag (angenommenes Angebot) als abgeschlossen/bezahlt kennzeichnen. */
export async function completeQuote(id: string): Promise<void> {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, number")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "paid", paid_at: today() } as never)
    .eq("id", id);
  if (updateError) throw updateError;
  await logAudit("quote_completed", { id, number: doc.number }, {});
}

function formatToday(): string {
  return new Date().toLocaleDateString("de-DE-u-ca-gregory-nu-latn");
}

/**
 * Beleg umwandeln: Angebot → Auftragsbestätigung → Rechnung.
 * Positionen, Kunde und Konditionen werden vollständig übernommen.
 */
async function convertDocument(sourceId: string, target: "order" | "invoice"): Promise<string> {
  const userId = await currentUserId();
  const { data: src, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (error) throw error;

  const expected = target === "order" ? "quote" : "order";
  if (src.type !== expected) {
    throw new Error(
      target === "order"
        ? "Nur Angebote können in eine Auftragsbestätigung umgewandelt werden."
        : "Nur Auftragsbestätigungen können in eine Rechnung umgewandelt werden.",
    );
  }
  const converted = (src as unknown as Record<string, unknown>)["converted_document_id"];
  if (converted) throw new Error("Dieser Beleg wurde bereits umgewandelt.");

  const { data: items } = await supabase
    .from("document_items")
    .select("*")
    .eq("document_id", sourceId)
    .order("position");

  const { data: settings } = await supabase
    .from("company_settings")
    .select("payment_terms_days")
    .maybeSingle();
  const { data: existing } = await supabase.from("documents").select("number, type");
  const number = nextNumber(
    target,
    (existing ?? []).filter((d) => d.type === target).map((d) => d.number),
  );

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
    paid_at: _pa,
    retention_until: _ru,
    deleted_at: _dl,
    ...rest
  } = src as unknown as Record<string, unknown>;

  const { data: created, error: insertError } = await supabase
    .from("documents")
    .insert({
      ...rest,
      user_id: userId,
      type: target,
      number,
      status: "draft",
      issue_date: issue,
      due_date:
        target === "invoice" ? addDays(issue, Number(settings?.payment_terms_days ?? 14)) : null,
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
        is_optional: i.is_optional,
      })),
    );
  }

  await supabase
    .from("documents")
    .update({
      converted_document_id: created.id,
      ...(target === "order" ? { status: "accepted" } : {}),
    } as never)
    .eq("id", sourceId);

  await logAudit(
    target === "order" ? "quote_converted_order" : "order_converted_invoice",
    { id: sourceId, number: src.number },
    { target, number },
  );
  return created.id as string;
}

/** Angenommenes Angebot in eine Auftragsbestätigung (Entwurf) umwandeln. */
export async function convertQuoteToOrder(quoteId: string): Promise<string> {
  return convertDocument(quoteId, "order");
}

/** Auftragsbestätigung in eine Rechnung (Entwurf) umwandeln. */
export async function convertOrderToInvoice(orderId: string): Promise<string> {
  return convertDocument(orderId, "invoice");
}
