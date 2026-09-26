import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/auth-user";

type RecipientSnapshot = {
  customer_name?: string | null;
  customer_company?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address_line?: string | null;
  customer_postal_code?: string | null;
  customer_city?: string | null;
  customer_country?: string | null;
  customer_vat_id?: string | null;
};

function norm(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("de-DE");
}

/**
 * Accepted prospect quote -> real customer.
 * Reuses an obvious existing customer first, so accepting a quote does not
 * create duplicate customer master records.
 */
export async function ensureCustomerForAcceptedQuote(
  documentId: string,
): Promise<{ customerId: string; created: boolean } | null> {
  const userId = await requireUserId();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (docError) throw docError;
  if (doc.type !== "quote") return null;
  if (doc.customer_id) return { customerId: doc.customer_id, created: false };

  const recipient = doc as unknown as RecipientSnapshot;
  const name = String(recipient.customer_name ?? "").trim();
  const company = String(recipient.customer_company ?? "").trim();
  const email = String(recipient.customer_email ?? "").trim();
  const phone = String(recipient.customer_phone ?? "").trim();
  const address = String(recipient.customer_address_line ?? "").trim();
  const postal = String(recipient.customer_postal_code ?? "").trim();
  const city = String(recipient.customer_city ?? "").trim();
  const country = String(recipient.customer_country ?? "Deutschland").trim() || "Deutschland";
  const vatId = String(recipient.customer_vat_id ?? "").trim();

  if (!name && !company) {
    throw new Error("Bitte beim Interessenten mindestens Name oder Firma eintragen.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("id,name,company,email,address_line,postal_code,city,deleted_at")
    .is("deleted_at", null);
  if (existingError) throw existingError;

  const match =
    existing.find((c) => email && norm(c.email) === norm(email)) ??
    existing.find(
      (c) =>
        Boolean(company) &&
        norm(c.company) === norm(company) &&
        norm(c.address_line) === norm(address) &&
        norm(c.postal_code) === norm(postal) &&
        norm(c.city) === norm(city),
    ) ??
    existing.find(
      (c) =>
        !company &&
        Boolean(name) &&
        norm(c.name) === norm(name) &&
        norm(c.address_line) === norm(address) &&
        norm(c.postal_code) === norm(postal) &&
        norm(c.city) === norm(city),
    );

  let customerId = match?.id ?? "";
  let created = false;

  if (!customerId) {
    const { data: number, error: numberError } = await supabase.rpc("next_customer_number");
    if (numberError) throw numberError;

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        user_id: userId,
        name: name || company,
        company,
        email,
        phone,
        address_line: address,
        postal_code: postal,
        city,
        country,
        vat_id: vatId,
        customer_number: String(number ?? ""),
        status: "active",
      })
      .select("id")
      .single();
    if (customerError) throw customerError;
    customerId = customer.id;
    created = true;
  }

  const { data: customer, error: loadError } = await supabase
    .from("customers")
    .select("id,customer_number")
    .eq("id", customerId)
    .single();
  if (loadError) throw loadError;

  const { error: linkError } = await supabase
    .from("documents")
    .update({
      customer_id: customerId,
      customer_number: customer.customer_number ?? "",
    } as never)
    .eq("id", documentId);
  if (linkError) throw linkError;

  return { customerId, created };
}
