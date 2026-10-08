import "@tanstack/react-start/server-only";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createStripeSubscriptionCheckout,
  retrieveStripeCheckout,
  stripeBillingMode,
  type StripeCheckoutInput,
} from "./stripe-billing.server";

type Order = Record<string, unknown>;
type Attempt = {
  id: string;
  input: StripeCheckoutInput;
  order_data: Order;
  session_id: string | null;
};

/** Persist immutable parameters before contacting Stripe, including on timeout.
 * A database unique key serializes separate workers; Stripe serializes their POSTs.
 */
export async function managedStripeCheckout(input: StripeCheckoutInput, order: Order) {
  const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const mode = stripeBillingMode();
  if (mode === "off")
    throw new Error("Online-Zahlung ist noch nicht verfügbar. Bitte Rechnung wählen.");
  const assertSameOrder = (stored: Order) => {
    const fields = [
      "plan_id",
      "billing_interval",
      "net_cents",
      "vat_cents",
      "gross_cents",
      "country",
      "vat_id",
      "email",
      "company_name",
      "address_line",
      "postal_code",
      "city",
    ];
    if (fields.some((field) => String(stored[field] ?? "") !== String(order[field] ?? ""))) {
      throw new Error(
        "Es besteht eine offene Zahlung mit anderen Bestelldaten. Bitte zuerst abschließen oder den Ablauf abwarten.",
      );
    }
  };
  for (let retries = 0; retries < 3; retries++) {
    const candidateId = crypto.randomUUID();
    const { error: reserveError } = await db.from("stripe_checkout_attempts").upsert(
      {
        id: candidateId,
        subscription_id: input.subscriptionId,
        user_id: input.userId,
        billing_mode: mode,
        input,
        order_data: order,
      },
      { onConflict: "subscription_id,billing_mode", ignoreDuplicates: true },
    );
    if (reserveError) throw reserveError;
    const { data, error } = await db
      .from("stripe_checkout_attempts")
      .select("id,input,order_data,session_id")
      .eq("subscription_id", input.subscriptionId)
      .eq("user_id", input.userId)
      .eq("billing_mode", mode)
      .single();
    if (error || !data) throw error || new Error("Zahlung konnte nicht reserviert werden.");
    const attempt = data as Attempt;
    let sessionId = attempt.session_id;
    // Keep sessions created before this migration, avoiding a second payable checkout.
    if (!sessionId) {
      const { data: legacy, error: legacyError } = await db
        .from("plan_orders")
        .select("*")
        .eq("subscription_id", input.subscriptionId)
        .eq("customer_user_id", input.userId)
        .not("stripe_checkout_session_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (legacyError) throw legacyError;
      if (legacy?.stripe_checkout_session_id) {
        const previous = await retrieveStripeCheckout(legacy.stripe_checkout_session_id);
        if (previous.status === "complete")
          throw new Error("Zahlung wird bereits verarbeitet. Bitte den Paketstatus abwarten.");
        if (
          previous.status === "open" &&
          previous.url?.startsWith("https://checkout.stripe.com/")
        ) {
          assertSameOrder(legacy as Order);
          return { checkout: { id: previous.id, url: previous.url }, order: legacy as Order };
        }
        if (previous.status !== "expired")
          throw new Error("Stripe-Zahlungsstatus konnte nicht geprüft werden.");
      }
    }
    if (sessionId) {
      const previous = await retrieveStripeCheckout(sessionId);
      if (previous.status === "complete")
        throw new Error("Zahlung wird bereits verarbeitet. Bitte den Paketstatus abwarten.");
      if (previous.status === "expired") {
        const { error: deleteError } = await db
          .from("stripe_checkout_attempts")
          .delete()
          .eq("id", attempt.id)
          .eq("user_id", input.userId)
          .eq("session_id", sessionId);
        if (deleteError) throw deleteError;
        continue;
      }
      if (previous.status !== "open" || !previous.url?.startsWith("https://checkout.stripe.com/"))
        throw new Error("Stripe-Zahlungsstatus konnte nicht geprüft werden.");
      assertSameOrder(attempt.order_data);
      return { checkout: { id: previous.id, url: previous.url }, order: attempt.order_data };
    }
    assertSameOrder(attempt.order_data);
    const checkout = await createStripeSubscriptionCheckout(attempt.input);
    if (!checkout)
      throw new Error("Online-Zahlung ist noch nicht verfügbar. Bitte Rechnung wählen.");
    sessionId = checkout.id;
    const { error: updateError } = await db
      .from("stripe_checkout_attempts")
      .update({ session_id: sessionId })
      .eq("id", attempt.id)
      .eq("user_id", input.userId);
    if (updateError) throw updateError;
    return { checkout, order: attempt.order_data };
  }
  throw new Error("Zahlungsdaten haben sich geändert. Bitte erneut versuchen.");
}
